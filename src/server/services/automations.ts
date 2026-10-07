import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/server/db";
import {
  accountsPayable,
  accountsReceivable,
  approvalRequests,
  cashTransactions,
  contractAdditions,
  contracts,
  costCenters,
  dailyLogs,
  employees,
  financialCategories,
  leads,
  measurements,
  nonconformities,
  productBatches,
  products,
  projectAreas,
  projectBudgets,
  projectCostEntries,
  projects,
  projectStatuses,
  quoteItems,
  quotes,
  stockMovements,
  tightnessTests,
  timeEntries,
  warehouses,
  waterproofingApplications,
  warranties,
  deliveryTerms,
} from "@/server/db/schema";
import { audit, type AuditActor } from "@/server/audit";
import { addDays, addMonths, todayISO } from "@/domain/dates";
import { round2, splitInstallments, sumMoney } from "@/domain/money";
import { applyPayment, netDue } from "@/domain/receivables";
import { assertAvailable, validateMovement, weightedAverageCost, type StockMovementType } from "@/domain/stock";
import { computeWorkedHours, laborCost, nextPunch, type PunchKind } from "@/domain/timesheet";
import { requiredApprover, canApprove, DEFAULT_APPROVAL_RULES, type ApprovalKind, type ApprovalRules } from "@/domain/approvals";
import { BusinessError, assertFound } from "./errors";
import { getSetting } from "./settings";

export interface Actor extends AuditActor {
  id: string;
  roleKey: string;
}

const n = (v: unknown) => Number(v ?? 0);

export async function statusIdByKey(tx: Tx | typeof db, companyId: string, key: string) {
  const [s] = await tx
    .select({ id: projectStatuses.id })
    .from(projectStatuses)
    .where(and(eq(projectStatuses.companyId, companyId), eq(projectStatuses.key, key)))
    .limit(1);
  return assertFound(s, `Status "${key}"`).id;
}

async function nextProjectCode(tx: Tx, companyId: string) {
  const [r] = await tx
    .select({ max: sql<string>`coalesce(max(substring(${projects.code} from '[0-9]+$')::int), 0)` })
    .from(projects)
    .where(eq(projects.companyId, companyId));
  return `OB-${String(n(r.max) + 1).padStart(3, "0")}`;
}

/** Garante a existência de um depósito vinculado à obra (estoque por obra). */
async function ensureProjectWarehouse(tx: Tx, companyId: string, projectId: string, name: string) {
  const [w] = await tx.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.projectId, projectId)).limit(1);
  if (w) return w.id;
  const [created] = await tx
    .insert(warehouses)
    .values({ companyId, name: `Obra ${name}`, type: "obra", projectId })
    .returning({ id: warehouses.id });
  return created.id;
}

async function categoryId(tx: Tx, companyId: string, name: string) {
  const [c] = await tx
    .select({ id: financialCategories.id })
    .from(financialCategories)
    .where(and(eq(financialCategories.companyId, companyId), eq(financialCategories.name, name)))
    .limit(1);
  return c?.id ?? null;
}

// ---------------------------------------------------------------------------
// Orçamento aprovado → contrato → obra → centro de custo → previsão financeira
// ---------------------------------------------------------------------------

export interface ApproveQuoteOptions {
  startDate: string;
  billing: "parcelas" | "medicao";
  downPaymentPct: number;
  installments: number;
  retentionRate?: number;
}

export async function approveQuote(actor: Actor, quoteId: string, opts: ApproveQuoteOptions) {
  return db.transaction(async (tx) => {
    const [quote] = await tx.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId))).limit(1);
    assertFound(quote, "Orçamento");
    if (quote.status === "aprovado") throw new BusinessError("Este orçamento já foi aprovado.");
    if (quote.status === "reprovado") throw new BusinessError("Orçamento reprovado não pode ser aprovado. Duplique e crie uma nova versão.");

    const [pendingDiscount] = await tx
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(and(eq(approvalRequests.entityId, quoteId), eq(approvalRequests.kind, "desconto"), eq(approvalRequests.status, "pendente")))
      .limit(1);
    if (pendingDiscount) throw new BusinessError("O desconto deste orçamento ainda aguarda aprovação.");

    const items = await tx.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId)).orderBy(asc(quoteItems.position));
    if (items.length === 0) throw new BusinessError("O orçamento não possui itens.");

    const gross = sumMoney(items.map((i) => i.quantity * i.unitPrice));
    const total = round2(gross - quote.discount);
    const materials = sumMoney(items.map((i) => i.quantity * i.materialUnitCost));
    const labor = sumMoney(items.map((i) => i.quantity * i.laborUnitCost));
    const taxes = round2((total * quote.taxRate) / 100);
    const area = items.filter((i) => i.unit === "m²").reduce((s, i) => s + i.quantity, 0);
    const days = quote.executionDays ?? 30;

    const contractNumber = `CT-${new Date().getFullYear()}-${String(quote.number).padStart(4, "0")}`;
    const [contract] = await tx
      .insert(contracts)
      .values({
        companyId: actor.companyId,
        number: contractNumber,
        clientId: quote.clientId,
        quoteId: quote.id,
        status: "aguardando_assinatura",
        value: total,
        startDate: opts.startDate,
        durationDays: days,
        paymentTerms: quote.paymentTerms,
        downPayment: round2((total * opts.downPaymentPct) / 100),
        installments: opts.installments,
        retentionRate: opts.retentionRate ?? 0,
        warrantyMonths: quote.warrantyMonths,
      })
      .returning();

    const statusId = await statusIdByKey(tx, actor.companyId, "contratada");
    const code = await nextProjectCode(tx, actor.companyId);
    const [project] = await tx
      .insert(projects)
      .values({
        companyId: actor.companyId,
        code,
        name: quote.title,
        clientId: quote.clientId,
        contractId: contract.id,
        statusId,
        address: quote.siteAddress,
        city: quote.siteCity,
        state: quote.siteState,
        plannedStart: opts.startDate,
        contractDays: days,
        plannedEnd: addDays(opts.startDate, days),
        contractValue: total,
        retentionRate: opts.retentionRate ?? 0,
        contractedArea: area,
        dailyTargetArea: area > 0 ? Math.ceil(area / Math.max(Math.round((days * 5) / 7), 1)) : null,
        warrantyMonths: quote.warrantyMonths,
        engineerId: actor.id,
      })
      .returning();

    // Centro de custo da obra
    await tx.insert(costCenters).values({
      companyId: actor.companyId,
      code: code,
      name: `Obra ${code} — ${quote.title}`.slice(0, 160),
      kind: "obra",
      projectId: project.id,
    });

    // Orçamento de custos (previsto)
    const budgetRows: Array<{ category: "materiais" | "mao_de_obra" | "impostos"; amount: number }> = [
      { category: "materiais", amount: materials },
      { category: "mao_de_obra", amount: labor },
      { category: "impostos", amount: taxes },
    ];
    await tx.insert(projectBudgets).values(budgetRows.map((b) => ({ projectId: project.id, ...b })));

    // Áreas a partir dos itens em m²
    for (const i of items.filter((x) => x.unit === "m²")) {
      const [areaRow] = await tx
        .insert(projectAreas)
        .values({ projectId: project.id, name: i.service.slice(0, 120), contractedArea: i.quantity, environmentType: i.description?.slice(0, 80) })
        .returning({ id: projectAreas.id });
      if (i.systemId) {
        await tx.insert(waterproofingApplications).values({ areaId: areaRow.id, systemId: i.systemId });
      }
    }

    await ensureProjectWarehouse(tx, actor.companyId, project.id, code);

    // Previsão financeira
    const catId = await categoryId(tx, actor.companyId, "Receita de serviços");
    const receivables: (typeof accountsReceivable.$inferInsert)[] = [];
    const down = contract.downPayment;
    if (down > 0) {
      receivables.push({
        companyId: actor.companyId, clientId: quote.clientId, projectId: project.id, contractId: contract.id, categoryId: catId,
        description: `Entrada — ${contractNumber}`, installment: 0, installmentsTotal: opts.installments,
        dueDate: opts.startDate, amount: down, forecast: false,
      });
    }
    const rest = round2(total - down);
    if (rest > 0 && opts.installments > 0) {
      const parts = splitInstallments(rest, opts.installments);
      parts.forEach((amount, idx) =>
        receivables.push({
          companyId: actor.companyId, clientId: quote.clientId, projectId: project.id, contractId: contract.id, categoryId: catId,
          description: opts.billing === "medicao" ? `Previsão de medição ${idx + 1}/${parts.length} — ${contractNumber}` : `Parcela ${idx + 1}/${parts.length} — ${contractNumber}`,
          installment: idx + 1, installmentsTotal: parts.length,
          dueDate: addMonths(opts.startDate, idx + 1), amount,
          forecast: opts.billing === "medicao",
        }),
      );
    }
    if (receivables.length) await tx.insert(accountsReceivable).values(receivables);

    await tx.update(quotes).set({ status: "aprovado", approvedAt: new Date() }).where(eq(quotes.id, quoteId));
    if (quote.leadId) await tx.update(leads).set({ stage: "fechado", clientId: quote.clientId, closedAt: new Date() }).where(eq(leads.id, quote.leadId));
    await audit(tx, actor, "quote.approve", "quote", quoteId, { status: quote.status }, { status: "aprovado", contractId: contract.id, projectId: project.id });
    await audit(tx, actor, "contract.create", "contract", contract.id, undefined, contract);
    await audit(tx, actor, "project.create", "project", project.id, undefined, { code, name: project.name, contractValue: total });

    return { contractId: contract.id, projectId: project.id, projectCode: code };
  });
}

// ---------------------------------------------------------------------------
// Medição faturada → contas a receber (consumindo a previsão)
// ---------------------------------------------------------------------------

export async function invoiceMeasurement(actor: Actor, measurementId: string, dueDate: string) {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ m: measurements, project: projects })
      .from(measurements)
      .innerJoin(projects, eq(projects.id, measurements.projectId))
      .where(and(eq(measurements.id, measurementId), eq(projects.companyId, actor.companyId)))
      .limit(1);
    assertFound(m, "Medição");
    if (m.m.status !== "aprovada") throw new BusinessError("Somente medições aprovadas podem ser faturadas.");
    if (m.m.netValue <= 0) throw new BusinessError("Medição sem valor.");

    const catId = await categoryId(tx, actor.companyId, "Receita de serviços");
    const [ar] = await tx
      .insert(accountsReceivable)
      .values({
        companyId: actor.companyId,
        clientId: m.project.clientId,
        projectId: m.project.id,
        contractId: m.project.contractId,
        measurementId: m.m.id,
        categoryId: catId,
        description: `Medição ${m.m.number} — ${m.project.code}`,
        dueDate,
        amount: m.m.netValue,
        forecast: false,
      })
      .returning();

    // Abate o valor faturado das previsões futuras da obra (evita contar duas vezes no fluxo de caixa)
    let toConsume = m.m.netValue;
    const forecasts = await tx
      .select()
      .from(accountsReceivable)
      .where(and(eq(accountsReceivable.projectId, m.project.id), eq(accountsReceivable.forecast, true), eq(accountsReceivable.cancelled, false)))
      .orderBy(asc(accountsReceivable.dueDate));
    for (const f of forecasts) {
      if (toConsume <= 0) break;
      const take = Math.min(f.amount, toConsume);
      toConsume = round2(toConsume - take);
      const remaining = round2(f.amount - take);
      await tx
        .update(accountsReceivable)
        .set(remaining <= 0 ? { cancelled: true } : { amount: remaining })
        .where(eq(accountsReceivable.id, f.id));
    }

    await tx.update(measurements).set({ status: "faturada", invoicedAt: new Date(), dueDate }).where(eq(measurements.id, measurementId));
    await audit(tx, actor, "measurement.invoice", "measurement", measurementId, { status: "aprovada" }, { status: "faturada", receivableId: ar.id });
    return ar;
  });
}

export async function approveMeasurement(actor: Actor, measurementId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ m: measurements })
      .from(measurements)
      .innerJoin(projects, eq(projects.id, measurements.projectId))
      .where(and(eq(measurements.id, measurementId), eq(projects.companyId, actor.companyId)))
      .limit(1);
    assertFound(row, "Medição");
    if (row.m.status !== "executada") throw new BusinessError("Somente medições executadas podem ser aprovadas.");
    const rules = await getSetting<ApprovalRules>(actor.companyId, "approvals.rules", DEFAULT_APPROVAL_RULES);
    const required = requiredApprover("medicao", row.m.grossValue, rules);
    if (!canApprove(actor.roleKey, required)) {
      throw new BusinessError(`Medição de ${row.m.grossValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} exige aprovação de: ${required}.`);
    }
    await tx.update(measurements).set({ status: "aprovada", approvedAt: new Date(), approvedById: actor.id }).where(eq(measurements.id, measurementId));
    await audit(tx, actor, "measurement.approve", "measurement", measurementId, { status: "executada" }, { status: "aprovada" });
  });
}

// ---------------------------------------------------------------------------
// Recebimento / pagamento → caixa
// ---------------------------------------------------------------------------

export interface SettleInput {
  amount: number;
  date: string;
  bankAccountId: string;
  method: "pix" | "boleto" | "transferencia" | "cartao" | "dinheiro" | "cheque";
  interest?: number;
  discount?: number;
}

export async function receiveReceivable(actor: Actor, receivableId: string, input: SettleInput) {
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select()
      .from(accountsReceivable)
      .where(and(eq(accountsReceivable.id, receivableId), eq(accountsReceivable.companyId, actor.companyId)))
      .for("update")
      .limit(1);
    assertFound(r, "Título a receber");
    if (r.forecast) throw new BusinessError("Este título é uma previsão. Fature a medição antes de receber.");
    const updated = { ...r, interest: input.interest ?? r.interest, discount: input.discount ?? r.discount };
    const { receivedAmount, fullyPaid } = applyPayment(updated, input.amount);

    await tx
      .update(accountsReceivable)
      .set({
        receivedAmount,
        interest: updated.interest,
        discount: updated.discount,
        receivedAt: input.date,
        bankAccountId: input.bankAccountId,
        method: input.method,
      })
      .where(eq(accountsReceivable.id, receivableId));

    await tx.insert(cashTransactions).values({
      companyId: actor.companyId,
      bankAccountId: input.bankAccountId,
      direction: "in",
      amount: input.amount,
      date: input.date,
      description: r.description,
      receivableId,
      method: input.method,
      createdById: actor.id,
    });

    if (fullyPaid && r.measurementId) {
      await tx.update(measurements).set({ status: "recebida" }).where(eq(measurements.id, r.measurementId));
    }
    await audit(tx, actor, "receivable.receive", "accounts_receivable", receivableId, { receivedAmount: r.receivedAmount }, { receivedAmount, amount: input.amount, date: input.date });
    return { receivedAmount, fullyPaid, balance: round2(netDue(updated) - receivedAmount) };
  });
}

export async function payPayable(actor: Actor, payableId: string, input: SettleInput) {
  return db.transaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(accountsPayable)
      .where(and(eq(accountsPayable.id, payableId), eq(accountsPayable.companyId, actor.companyId)))
      .for("update")
      .limit(1);
    assertFound(p, "Conta a pagar");
    if (p.cancelled) throw new BusinessError("Conta cancelada.");
    if (p.approvalStatus !== "aprovado") throw new BusinessError("Esta despesa ainda aguarda aprovação.");
    const open = round2(p.amount - p.paidAmount);
    if (!(input.amount > 0)) throw new BusinessError("Informe um valor maior que zero.");
    if (input.amount - open > 0.004) throw new BusinessError(`Valor excede o saldo em aberto (R$ ${open.toFixed(2)}).`);
    const paidAmount = round2(p.paidAmount + input.amount);
    await tx
      .update(accountsPayable)
      .set({ paidAmount, paidAt: input.date, bankAccountId: input.bankAccountId, method: input.method })
      .where(eq(accountsPayable.id, payableId));
    await tx.insert(cashTransactions).values({
      companyId: actor.companyId,
      bankAccountId: input.bankAccountId,
      direction: "out",
      amount: input.amount,
      date: input.date,
      description: p.description,
      payableId,
      method: input.method,
      createdById: actor.id,
    });
    await audit(tx, actor, "payable.pay", "accounts_payable", payableId, { paidAmount: p.paidAmount }, { paidAmount, amount: input.amount });
    return { paidAmount, fullyPaid: paidAmount >= p.amount };
  });
}

// ---------------------------------------------------------------------------
// Conta a pagar → (aprovação) → custo da obra
// ---------------------------------------------------------------------------

export interface PayableInput {
  description: string;
  categoryId: string;
  amount: number;
  dueDate: string;
  competenceDate?: string;
  supplierId?: string | null;
  employeeId?: string | null;
  projectId?: string | null;
  costCenterId?: string | null;
  documentNumber?: string | null;
}

async function postPayableCost(tx: Tx, payable: typeof accountsPayable.$inferSelect) {
  if (!payable.projectId) return;
  const [cat] = await tx.select().from(financialCategories).where(eq(financialCategories.id, payable.categoryId)).limit(1);
  await tx
    .insert(projectCostEntries)
    .values({
      projectId: payable.projectId,
      category: cat?.costCategory ?? "outros",
      amount: payable.amount,
      date: payable.competenceDate,
      description: payable.description,
      source: "payable",
      sourceId: payable.id,
    })
    .onConflictDoNothing();
}

export async function createPayable(actor: Actor, input: PayableInput) {
  if (!(input.amount > 0)) throw new BusinessError("Valor deve ser maior que zero.");
  return db.transaction(async (tx) => {
    const rules = await getSetting<ApprovalRules>(actor.companyId, "approvals.rules", DEFAULT_APPROVAL_RULES);
    const required = requiredApprover("despesa", input.amount, rules);
    const autoApproved = canApprove(actor.roleKey, required);

    const [payable] = await tx
      .insert(accountsPayable)
      .values({
        companyId: actor.companyId,
        description: input.description,
        categoryId: input.categoryId,
        amount: round2(input.amount),
        dueDate: input.dueDate,
        competenceDate: input.competenceDate ?? input.dueDate,
        supplierId: input.supplierId || null,
        employeeId: input.employeeId || null,
        projectId: input.projectId || null,
        costCenterId: input.costCenterId || null,
        documentNumber: input.documentNumber || null,
        approvalStatus: autoApproved ? "aprovado" : "pendente",
      })
      .returning();

    if (autoApproved) {
      await postPayableCost(tx, payable);
    } else {
      await tx.insert(approvalRequests).values({
        companyId: actor.companyId,
        kind: "despesa",
        entityId: payable.id,
        amount: payable.amount,
        description: payable.description,
        requiredRole: required,
        requestedById: actor.id,
      });
    }
    await audit(tx, actor, "payable.create", "accounts_payable", payable.id, undefined, payable);
    return { payable, pendingApproval: !autoApproved, requiredRole: required };
  });
}

export async function decideApproval(actor: Actor, approvalId: string, approve: boolean, comment?: string) {
  return db.transaction(async (tx) => {
    const [a] = await tx
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.id, approvalId), eq(approvalRequests.companyId, actor.companyId)))
      .limit(1);
    assertFound(a, "Aprovação");
    if (a.status !== "pendente") throw new BusinessError("Esta solicitação já foi decidida.");
    if (!canApprove(actor.roleKey, a.requiredRole)) throw new BusinessError(`Esta alçada exige aprovação de: ${a.requiredRole}.`);
    if (a.requestedById === actor.id && actor.roleKey !== "admin") throw new BusinessError("Quem solicitou não pode aprovar a própria solicitação.");

    await tx
      .update(approvalRequests)
      .set({ status: approve ? "aprovado" : "reprovado", decidedById: actor.id, decidedAt: new Date(), comment: comment ?? null })
      .where(eq(approvalRequests.id, approvalId));

    if (a.kind === "despesa" || a.kind === "pagamento") {
      const [payable] = await tx
        .update(accountsPayable)
        .set(approve ? { approvalStatus: "aprovado" } : { approvalStatus: "reprovado", cancelled: true })
        .where(eq(accountsPayable.id, a.entityId))
        .returning();
      if (approve && payable) await postPayableCost(tx, payable);
    }
    if (a.kind === "aditivo") {
      await tx
        .update(contractAdditions)
        .set(approve ? { status: "aprovado", approvedAt: new Date() } : { status: "reprovado" })
        .where(eq(contractAdditions.id, a.entityId));
    }
    await audit(tx, actor, approve ? "approval.approve" : "approval.reject", "approval_request", approvalId, { status: "pendente" }, { status: approve ? "aprovado" : "reprovado", comment });
  });
}

/** Cria uma solicitação genérica respeitando a alçada configurada. */
export async function requestApproval(tx: Tx, actor: Actor, kind: ApprovalKind, entityId: string, amount: number, description: string) {
  const rules = await getSetting<ApprovalRules>(actor.companyId, "approvals.rules", DEFAULT_APPROVAL_RULES);
  const required = requiredApprover(kind, amount, rules);
  if (canApprove(actor.roleKey, required)) return { autoApproved: true, required };
  await tx.insert(approvalRequests).values({ companyId: actor.companyId, kind, entityId, amount, description, requiredRole: required, requestedById: actor.id });
  return { autoApproved: false, required };
}

// ---------------------------------------------------------------------------
// Estoque: movimentações, consumo na obra → custo da obra
// ---------------------------------------------------------------------------

export async function warehouseBalance(tx: Tx | typeof db, productId: string, warehouseId: string, batchId?: string | null) {
  const batchFilter = batchId ? sql`and ${stockMovements.batchId} = ${batchId}` : sql``;
  const [r] = await tx.execute<{ balance: string }>(sql`
    select coalesce(sum(case
      when ${stockMovements.toWarehouseId} = ${warehouseId} and ${stockMovements.type} = 'ajuste' then ${stockMovements.quantity}
      when ${stockMovements.toWarehouseId} = ${warehouseId} then abs(${stockMovements.quantity})
      else 0 end), 0)
    - coalesce(sum(case when ${stockMovements.fromWarehouseId} = ${warehouseId} and ${stockMovements.type} <> 'ajuste' then abs(${stockMovements.quantity}) else 0 end), 0) as balance
    from ${stockMovements}
    where ${stockMovements.productId} = ${productId} ${batchFilter}
  `).then((res) => res.rows);
  return Math.round(n(r?.balance) * 1000) / 1000;
}

export interface MovementInput {
  type: StockMovementType;
  productId: string;
  batchId?: string | null;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  quantity: number;
  unitCost?: number | null;
  projectId?: string | null;
  areaId?: string | null;
  employeeId?: string | null;
  date?: string;
  notes?: string | null;
  clientUuid?: string | null;
}

export async function registerStockMovement(actor: Actor, input: MovementInput) {
  return db.transaction(async (tx) => {
    if (input.clientUuid) {
      const [dup] = await tx.select({ id: stockMovements.id }).from(stockMovements).where(eq(stockMovements.clientUuid, input.clientUuid)).limit(1);
      if (dup) return { id: dup.id, duplicated: true };
    }
    const mv = {
      type: input.type,
      quantity: input.quantity,
      fromWarehouseId: input.fromWarehouseId ?? null,
      toWarehouseId: input.toWarehouseId ?? null,
      projectId: input.projectId ?? null,
    };
    try {
      validateMovement(mv);
    } catch (e) {
      throw new BusinessError((e as Error).message);
    }

    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.companyId, actor.companyId)))
      .for("update")
      .limit(1);
    assertFound(product, "Produto");

    if (input.batchId) {
      const [b] = await tx.select().from(productBatches).where(eq(productBatches.id, input.batchId)).limit(1);
      assertFound(b, "Lote");
      if (b.blocked && ["consumo", "transferencia", "saida"].includes(input.type)) throw new BusinessError(`Lote ${b.batchNumber} está bloqueado: ${b.blockReason ?? "verificar qualidade"}.`);
      const date = input.date ?? todayISO();
      if (b.expiresAt && b.expiresAt < date && input.type === "consumo") throw new BusinessError(`Lote ${b.batchNumber} está vencido (${b.expiresAt.split("-").reverse().join("/")}).`);
    }

    if (mv.fromWarehouseId && input.type !== "ajuste") {
      const available = await warehouseBalance(tx, input.productId, mv.fromWarehouseId, input.batchId);
      try {
        assertAvailable(available, input.quantity, product.name);
      } catch (e) {
        throw new BusinessError((e as Error).message);
      }
    }

    let unitCost = input.unitCost ?? product.averageCost;
    if (input.type === "entrada" && input.unitCost) {
      const totalQty = await tx.execute<{ q: string }>(sql`
        select coalesce(sum(case when ${stockMovements.toWarehouseId} is not null and ${stockMovements.type} <> 'transferencia' then abs(${stockMovements.quantity}) else 0 end), 0)
             - coalesce(sum(case when ${stockMovements.fromWarehouseId} is not null and ${stockMovements.type} in ('saida','perda','consumo') then abs(${stockMovements.quantity}) else 0 end), 0) as q
        from ${stockMovements} where ${stockMovements.productId} = ${input.productId}`).then((r) => n(r.rows[0]?.q));
      const avg = weightedAverageCost(totalQty, product.averageCost, input.quantity, input.unitCost);
      await tx.update(products).set({ averageCost: avg }).where(eq(products.id, product.id));
      unitCost = input.unitCost;
    }

    const date = input.date ?? todayISO();
    const [movement] = await tx
      .insert(stockMovements)
      .values({
        companyId: actor.companyId,
        type: input.type,
        productId: input.productId,
        batchId: input.batchId ?? null,
        fromWarehouseId: mv.fromWarehouseId,
        toWarehouseId: mv.toWarehouseId,
        quantity: input.quantity,
        unitCost,
        projectId: input.projectId ?? null,
        areaId: input.areaId ?? null,
        employeeId: input.employeeId ?? null,
        date,
        notes: input.notes ?? null,
        clientUuid: input.clientUuid ?? null,
        createdById: actor.id,
      })
      .returning();

    // Consumo (ou perda em obra) → custo da obra + rastreabilidade por área
    if ((input.type === "consumo" || input.type === "perda") && input.projectId) {
      await tx.insert(projectCostEntries).values({
        projectId: input.projectId,
        category: "materiais",
        amount: round2(input.quantity * unitCost),
        date,
        description: `${input.type === "perda" ? "Perda" : "Consumo"}: ${product.name} (${input.quantity} ${product.unit})`,
        source: "stock",
        sourceId: movement.id,
      });
      if (input.type === "consumo" && input.areaId) {
        await tx
          .update(waterproofingApplications)
          .set({ usedQuantity: sql`coalesce(${waterproofingApplications.usedQuantity}, 0) + ${input.quantity}` })
          .where(and(eq(waterproofingApplications.areaId, input.areaId), eq(waterproofingApplications.productId, input.productId)));
      }
    }
    // Devolução da obra ao estoque central → estorna custo
    if (input.type === "devolucao" && input.projectId) {
      await tx.insert(projectCostEntries).values({
        projectId: input.projectId,
        category: "materiais",
        amount: -round2(input.quantity * unitCost),
        date,
        description: `Devolução: ${product.name} (${input.quantity} ${product.unit})`,
        source: "stock",
        sourceId: movement.id,
      });
    }

    await audit(tx, actor, `stock.${input.type}`, "stock_movement", movement.id, undefined, movement);
    return { id: movement.id, duplicated: false };
  });
}

// ---------------------------------------------------------------------------
// Ponto digital → horas → custo de mão de obra da obra
// ---------------------------------------------------------------------------

export async function punchClock(
  actor: Actor,
  employeeId: string,
  opts: { projectId?: string | null; at?: Date; latitude?: string | null; longitude?: string | null; clientUuid?: string | null; kind?: PunchKind },
) {
  const at = opts.at ?? new Date();
  const date = todayISO(at);
  return db.transaction(async (tx) => {
    const [emp] = await tx.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.companyId, actor.companyId))).limit(1);
    assertFound(emp, "Funcionário");
    let [entry] = await tx.select().from(timeEntries).where(and(eq(timeEntries.employeeId, employeeId), eq(timeEntries.date, date))).for("update").limit(1);
    if (!entry) {
      [entry] = await tx.insert(timeEntries).values({ employeeId, date, projectId: opts.projectId ?? null, type: "trabalho" }).returning();
    }
    if (entry.type !== "trabalho") throw new BusinessError("Dia registrado como ausência — ajuste com o supervisor.");
    const kind = opts.kind ?? nextPunch(entry);
    if (!kind) throw new BusinessError("Todas as batidas de hoje já foram registradas.");
    if (entry[kind]) throw new BusinessError("Esta batida já foi registrada.");

    const patch: Partial<typeof timeEntries.$inferInsert> = { [kind]: at };
    if (opts.projectId && !entry.projectId) patch.projectId = opts.projectId;
    if (kind === "clockIn") {
      patch.latitude = opts.latitude ?? null;
      patch.longitude = opts.longitude ?? null;
      patch.clientUuid = opts.clientUuid ?? null;
    }
    const merged = { ...entry, ...patch };
    if (kind === "clockOut") {
      const { worked, overtime } = computeWorkedHours(merged);
      const cost = laborCost(worked, overtime, emp.hourlyRate);
      patch.workedHours = worked;
      patch.overtimeHours = overtime;
      patch.laborCost = cost;
      const projectId = merged.projectId;
      if (projectId && cost > 0) {
        await tx
          .insert(projectCostEntries)
          .values({ projectId, category: "mao_de_obra", amount: cost, date, description: `Mão de obra: ${emp.name} (${worked}h)`, source: "timesheet", sourceId: entry.id })
          .onConflictDoUpdate({ target: [projectCostEntries.source, projectCostEntries.sourceId], set: { amount: cost } });
      }
    }
    await tx.update(timeEntries).set(patch).where(eq(timeEntries.id, entry.id));
    await audit(tx, actor, `timesheet.${kind}`, "time_entry", entry.id, undefined, { employeeId, kind, at: at.toISOString() });
    return { kind, at, entryId: entry.id };
  });
}

// ---------------------------------------------------------------------------
// Diário de obra → avanço físico da área
// ---------------------------------------------------------------------------

export interface DailyLogInput {
  projectId: string;
  date: string;
  clientUuid?: string | null;
  weather?: string | null;
  workersPresent: number;
  hoursWorked: number;
  executedArea: number;
  areaId?: string | null;
  activities?: string | null;
  interferences?: string | null;
  delays?: string | null;
  visits?: string | null;
  occurrences?: string | null;
  notes?: string | null;
  equipmentUsed?: string | null;
  sign?: boolean;
}

export async function createDailyLog(actor: Actor, input: DailyLogInput) {
  return db.transaction(async (tx) => {
    if (input.clientUuid) {
      const [dup] = await tx.select({ id: dailyLogs.id }).from(dailyLogs).where(eq(dailyLogs.clientUuid, input.clientUuid)).limit(1);
      if (dup) return { id: dup.id, duplicated: true };
    }
    const [project] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.companyId, actor.companyId))).limit(1);
    assertFound(project, "Obra");
    if (input.executedArea < 0) throw new BusinessError("Área executada não pode ser negativa.");
    if (input.executedArea > 0 && input.areaId) {
      const [area] = await tx.select().from(projectAreas).where(and(eq(projectAreas.id, input.areaId), eq(projectAreas.projectId, input.projectId))).for("update").limit(1);
      assertFound(area, "Área");
      const newExecuted = Math.round((area.executedArea + input.executedArea) * 1000) / 1000;
      if (area.contractedArea > 0 && newExecuted > area.contractedArea * 1.05) {
        throw new BusinessError(`Área executada (${newExecuted} m²) ultrapassa a contratada (${area.contractedArea} m²) de "${area.name}". Registre um aditivo.`);
      }
      await tx.update(projectAreas).set({ executedArea: newExecuted }).where(eq(projectAreas.id, area.id));
    }
    const [log] = await tx
      .insert(dailyLogs)
      .values({
        projectId: input.projectId,
        date: input.date,
        clientUuid: input.clientUuid ?? null,
        weather: input.weather ?? null,
        workersPresent: input.workersPresent,
        hoursWorked: input.hoursWorked,
        executedArea: input.executedArea,
        areaId: input.areaId ?? null,
        activities: input.activities ?? null,
        interferences: input.interferences ?? null,
        delays: input.delays ?? null,
        visits: input.visits ?? null,
        occurrences: input.occurrences ?? null,
        notes: input.notes ?? null,
        equipmentUsed: input.equipmentUsed ?? null,
        createdById: actor.id,
        signedById: input.sign ? actor.id : null,
        signedAt: input.sign ? new Date() : null,
      })
      .returning();

    // Inicia a obra automaticamente no primeiro diário com produção
    if (input.executedArea > 0) {
      const execId = await statusIdByKey(tx, actor.companyId, "em_execucao");
      await tx
        .update(projects)
        .set({ actualStart: sql`coalesce(${projects.actualStart}, ${input.date})` })
        .where(eq(projects.id, input.projectId));
      await tx.execute(sql`
        update ${projects} set status_id = ${execId}
        where id = ${input.projectId}
          and status_id in (select id from ${projectStatuses} where company_id = ${actor.companyId} and key in ('contratada','aguardando_inicio','mobilizacao'))`);
    }
    await audit(tx, actor, "daily_log.create", "daily_log", log.id, undefined, { date: log.date, executedArea: log.executedArea });
    return { id: log.id, duplicated: false };
  });
}

// ---------------------------------------------------------------------------
// Qualidade: teste de estanqueidade reprovado → não conformidade
// ---------------------------------------------------------------------------

export interface TightnessInput {
  projectId: string;
  areaId?: string | null;
  startedAt: Date;
  endedAt?: Date | null;
  initialCondition?: string | null;
  result?: string | null;
  approved: boolean;
  notes?: string | null;
}

export async function recordTightnessTest(actor: Actor, input: TightnessInput) {
  return db.transaction(async (tx) => {
    const [project] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.companyId, actor.companyId))).limit(1);
    assertFound(project, "Obra");
    if (input.endedAt && input.endedAt <= input.startedAt) throw new BusinessError("O término deve ser posterior ao início.");
    const [test] = await tx
      .insert(tightnessTests)
      .values({ ...input, areaId: input.areaId ?? null, endedAt: input.endedAt ?? null, responsibleId: actor.id })
      .returning();
    let nonconformityId: string | null = null;
    if (!input.approved) {
      const [nc] = await tx
        .insert(nonconformities)
        .values({
          projectId: input.projectId,
          areaId: input.areaId ?? null,
          title: "Teste de estanqueidade reprovado",
          description: input.result ?? input.notes ?? null,
          severity: "alta",
          cause: "Estanqueidade",
          detectedAt: todayISO(),
          dueDate: addDays(todayISO(), 7),
          isRework: true,
          responsibleId: actor.id,
          source: "teste_estanqueidade",
          sourceId: test.id,
        })
        .returning({ id: nonconformities.id });
      nonconformityId = nc.id;
    }
    await audit(tx, actor, "tightness_test.create", "tightness_test", test.id, undefined, { approved: input.approved, nonconformityId });
    return { testId: test.id, nonconformityId };
  });
}

// ---------------------------------------------------------------------------
// Conclusão → termo de entrega → garantia
// ---------------------------------------------------------------------------

export async function signDeliveryTerm(
  actor: Actor,
  projectId: string,
  input: { deliveredAt: string; companySignerName: string; clientSignerName: string; notes?: string | null },
) {
  return db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.companyId, actor.companyId))).for("update").limit(1);
    assertFound(project, "Obra");
    const [openNc] = await tx
      .select({ c: sql<string>`count(*)` })
      .from(nonconformities)
      .where(and(eq(nonconformities.projectId, projectId), sql`${nonconformities.status} in ('aberta','em_tratamento')`, eq(nonconformities.severity, "critica")));
    if (n(openNc?.c) > 0) throw new BusinessError("Existem não conformidades críticas em aberto. Resolva-as antes da entrega.");

    const [term] = await tx
      .insert(deliveryTerms)
      .values({ projectId, deliveredAt: input.deliveredAt, companySignerName: input.companySignerName, clientSignerName: input.clientSignerName, notes: input.notes ?? null, signed: "sim" })
      .returning();

    const months = project.warrantyMonths ?? 60;
    const areas = await tx.select().from(projectAreas).where(eq(projectAreas.projectId, projectId));
    const apps = areas.length
      ? await tx.select().from(waterproofingApplications).where(inArray(waterproofingApplications.areaId, areas.map((a) => a.id)))
      : [];
    const rows = (areas.length ? areas : [null]).map((a) => ({
      projectId,
      areaId: a?.id ?? null,
      systemId: apps.find((x) => x.areaId === a?.id)?.systemId ?? null,
      service: a ? `Impermeabilização — ${a.name}` : `Impermeabilização — ${project.name}`,
      deliveredAt: input.deliveredAt,
      months,
      startsAt: input.deliveredAt,
      endsAt: addMonths(input.deliveredAt, months),
    }));
    await tx.insert(warranties).values(rows);

    const statusId = await statusIdByKey(tx, actor.companyId, "em_garantia");
    await tx.update(projects).set({ statusId, actualEnd: project.actualEnd ?? input.deliveredAt }).where(eq(projects.id, projectId));
    await audit(tx, actor, "project.deliver", "project", projectId, { statusId: project.statusId }, { statusId, deliveryTermId: term.id, warranties: rows.length });
    return { termId: term.id, warranties: rows.length };
  });
}

export async function changeProjectStatus(actor: Actor, projectId: string, statusKey: string) {
  return db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.companyId, actor.companyId))).limit(1);
    assertFound(project, "Obra");
    const statusId = await statusIdByKey(tx, actor.companyId, statusKey);
    const patch: Partial<typeof projects.$inferInsert> = { statusId };
    if (statusKey === "em_execucao" && !project.actualStart) patch.actualStart = todayISO();
    if (statusKey === "concluida" && !project.actualEnd) patch.actualEnd = todayISO();
    await tx.update(projects).set(patch).where(eq(projects.id, projectId));
    await audit(tx, actor, "project.status", "project", projectId, { statusId: project.statusId }, patch);
  });
}
