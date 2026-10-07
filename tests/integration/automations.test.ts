/**
 * Testes de integração das automações (§73, §77) contra um PostgreSQL real.
 * Rodam quando TEST_DATABASE_URL está definida (o banco é recriado do zero).
 *   TEST_DATABASE_URL=postgresql://.../revolution_imper_test npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

type Mods = {
  db: typeof import("@/server/db");
  s: typeof import("@/server/db/schema");
  auto: typeof import("@/server/services/automations");
  ops: typeof import("@/server/services/operations");
  summary: typeof import("@/server/services/project-summary");
  orm: typeof import("drizzle-orm");
};
let m: Mods;
let ids: { company: string; admin: string; supervisor: string; client: string; central: string; product: string; batch: string; bank: string; catMat: string; catTerc: string; employee: string };

suite("automações (integração com PostgreSQL)", () => {
  beforeAll(async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    await c.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
    await c.end();
    process.env.DATABASE_URL = url;
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url });
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    await pool.end();

    m = {
      db: await import("@/server/db"),
      s: await import("@/server/db/schema"),
      auto: await import("@/server/services/automations"),
      ops: await import("@/server/services/operations"),
      summary: await import("@/server/services/project-summary"),
      orm: await import("drizzle-orm"),
    };
    const { db } = m.db;
    const s = m.s;
    const [company] = await db.insert(s.companies).values({ name: "Teste" }).returning();
    const [roleAdmin] = await db.insert(s.roles).values({ companyId: company.id, key: "admin", name: "Admin" }).returning();
    const [roleSup] = await db.insert(s.roles).values({ companyId: company.id, key: "supervisor", name: "Supervisor" }).returning();
    const [admin] = await db.insert(s.users).values({ companyId: company.id, roleId: roleAdmin.id, name: "Admin", email: "a@t.com", passwordHash: "x" }).returning();
    const [sup] = await db.insert(s.users).values({ companyId: company.id, roleId: roleSup.id, name: "Sup", email: "s@t.com", passwordHash: "x" }).returning();
    const statuses: Array<[string, (typeof s.statusCategoryEnum.enumValues)[number]]> = [
      ["contratada", "pre_obra"], ["mobilizacao", "ativa"], ["em_execucao", "ativa"], ["concluida", "concluida"], ["em_garantia", "garantia"], ["aguardando_inicio", "pre_obra"],
    ];
    for (const [key, category] of statuses) await db.insert(s.projectStatuses).values({ companyId: company.id, key, label: key, category });
    const [client] = await db.insert(s.clients).values({ companyId: company.id, name: "Cliente X" }).returning();
    await db.insert(s.financialCategories).values({ companyId: company.id, name: "Receita de serviços", type: "receita", dreGroup: "receita" });
    const [catMat] = await db.insert(s.financialCategories).values({ companyId: company.id, name: "Materiais", type: "despesa", dreGroup: "custo_direto", costCategory: "materiais" }).returning();
    const [catTerc] = await db.insert(s.financialCategories).values({ companyId: company.id, name: "Terceiros", type: "despesa", dreGroup: "custo_direto", costCategory: "terceiros" }).returning();
    const [central] = await db.insert(s.warehouses).values({ companyId: company.id, name: "Central", type: "central" }).returning();
    const [product] = await db.insert(s.products).values({ companyId: company.id, sku: "MAN", name: "Manta", category: "Mantas", unit: "m²", averageCost: 10 }).returning();
    const [batch] = await db.insert(s.productBatches).values({ productId: product.id, batchNumber: "L1", expiresAt: "2099-01-01" }).returning();
    const [bank] = await db.insert(s.bankAccounts).values({ companyId: company.id, name: "Banco", openingBalance: 1000, openingDate: "2020-01-01" }).returning();
    const [emp] = await db.insert(s.employees).values({ companyId: company.id, name: "Aplicador", jobTitle: "Aplicador", hourlyRate: 20 }).returning();
    ids = { company: company.id, admin: admin.id, supervisor: sup.id, client: client.id, central: central.id, product: product.id, batch: batch.id, bank: bank.id, catMat: catMat.id, catTerc: catTerc.id, employee: emp.id };
  }, 60_000);

  afterAll(async () => {
    if (m) await (m.db.db.$client as import("pg").Pool).end();
  });

  const admin = () => ({ id: ids.admin, companyId: ids.company, roleKey: "admin" });
  const supervisor = () => ({ id: ids.supervisor, companyId: ids.company, roleKey: "supervisor" });

  let projectId = "";
  let warehouseId = "";

  it("orçamento aprovado → contrato, obra, centro de custo, estoque da obra, orçamento de custos e previsão financeira", async () => {
    const { db } = m.db;
    const s = m.s;
    const { eq } = m.orm;
    const [q] = await db.insert(s.quotes).values({ companyId: ids.company, number: 1, clientId: ids.client, title: "Obra teste", discount: 1000, taxRate: 6, executionDays: 20 }).returning();
    await db.insert(s.quoteItems).values([
      { quoteId: q.id, service: "Laje", unit: "m²", quantity: 100, materialUnitCost: 30, laborUnitCost: 20, unitPrice: 110 },
      { quoteId: q.id, service: "Ralos", unit: "un", quantity: 10, materialUnitCost: 10, laborUnitCost: 10, unitPrice: 100 },
    ]);
    const r = await m.auto.approveQuote(admin(), q.id, { startDate: "2030-01-10", billing: "parcelas", downPaymentPct: 20, installments: 3 });
    projectId = r.projectId;
    const [project] = await db.select().from(s.projects).where(eq(s.projects.id, r.projectId));
    expect(project.contractValue).toBe(11_000); // 11.000 + 1.000 − 1.000
    expect(project.contractedArea).toBe(100);
    const budgets = await db.select().from(s.projectBudgets).where(eq(s.projectBudgets.projectId, r.projectId));
    expect(budgets.find((b) => b.category === "materiais")?.amount).toBe(3_100);
    expect(budgets.find((b) => b.category === "mao_de_obra")?.amount).toBe(2_100);
    expect(budgets.find((b) => b.category === "impostos")?.amount).toBe(660);
    const cc = await db.select().from(s.costCenters).where(eq(s.costCenters.projectId, r.projectId));
    expect(cc).toHaveLength(1);
    const [wh] = await db.select().from(s.warehouses).where(eq(s.warehouses.projectId, r.projectId));
    warehouseId = wh.id;
    const ar = await db.select().from(s.accountsReceivable).where(eq(s.accountsReceivable.projectId, r.projectId));
    expect(ar).toHaveLength(4);
    expect(ar.reduce((a, x) => a + x.amount, 0)).toBeCloseTo(11_000, 2);
    const areas = await db.select().from(s.projectAreas).where(eq(s.projectAreas.projectId, r.projectId));
    expect(areas).toHaveLength(1);
    await expect(m.auto.approveQuote(admin(), q.id, { startDate: "2030-01-10", billing: "parcelas", downPaymentPct: 0, installments: 1 })).rejects.toThrow(/já foi aprovado/);
  });

  it("estoque: entrada, transferência, consumo na obra gera custo e bloqueia saldo negativo", async () => {
    await m.auto.registerStockMovement(admin(), { type: "entrada", productId: ids.product, batchId: ids.batch, toWarehouseId: ids.central, quantity: 50, unitCost: 12 });
    await m.auto.registerStockMovement(admin(), { type: "transferencia", productId: ids.product, batchId: ids.batch, fromWarehouseId: ids.central, toWarehouseId: warehouseId, quantity: 30 });
    expect(await m.auto.warehouseBalance(m.db.db, ids.product, ids.central)).toBe(20);
    expect(await m.auto.warehouseBalance(m.db.db, ids.product, warehouseId)).toBe(30);
    await expect(
      m.auto.registerStockMovement(admin(), { type: "consumo", productId: ids.product, batchId: ids.batch, fromWarehouseId: warehouseId, quantity: 31, projectId }),
    ).rejects.toThrow(/Saldo insuficiente/);
    const uuid = "11111111-1111-4111-8111-111111111111";
    await m.auto.registerStockMovement(admin(), { type: "consumo", productId: ids.product, batchId: ids.batch, fromWarehouseId: warehouseId, quantity: 10, projectId, clientUuid: uuid });
    const again = await m.auto.registerStockMovement(admin(), { type: "consumo", productId: ids.product, batchId: ids.batch, fromWarehouseId: warehouseId, quantity: 10, projectId, clientUuid: uuid });
    expect(again.duplicated).toBe(true); // reenvio offline não duplica
    expect(await m.auto.warehouseBalance(m.db.db, ids.product, warehouseId)).toBe(20);
    const { eq } = m.orm;
    const costs = await m.db.db.select().from(m.s.projectCostEntries).where(eq(m.s.projectCostEntries.projectId, projectId));
    // custo médio após entrada: (0 * 10 + 50 * 12) / 50 = 12
    expect(costs.reduce((a, c) => a + c.amount, 0)).toBe(120);
  });

  it("diário com m² atualiza área, inicia a obra e o resumo financeiro reflete o custo", async () => {
    const { db } = m.db;
    const { eq } = m.orm;
    const [area] = await db.select().from(m.s.projectAreas).where(eq(m.s.projectAreas.projectId, projectId));
    await m.auto.createDailyLog(admin(), { projectId, date: "2030-01-11", workersPresent: 3, hoursWorked: 27, executedArea: 40, areaId: area.id });
    const [after] = await db.select().from(m.s.projectAreas).where(eq(m.s.projectAreas.id, area.id));
    expect(after.executedArea).toBe(40);
    await expect(m.auto.createDailyLog(admin(), { projectId, date: "2030-01-12", workersPresent: 3, hoursWorked: 27, executedArea: 80, areaId: area.id })).rejects.toThrow(/ultrapassa/);
    const sum = await m.summary.loadProjectSummary(ids.company, projectId);
    expect(sum!.statusKey).toBe("em_execucao");
    expect(sum!.physicalProgress).toBeCloseTo(0.4, 5);
    expect(sum!.finance.incurredCost).toBe(120);
  });

  it("ponto: saída calcula horas e lança mão de obra na obra", async () => {
    const day = (h: string) => new Date(`2030-01-11T${h}:00-03:00`);
    await m.auto.punchClock(admin(), ids.employee, { projectId, at: day("07:00") });
    await m.auto.punchClock(admin(), ids.employee, { at: day("12:00") });
    await m.auto.punchClock(admin(), ids.employee, { at: day("13:00") });
    const r = await m.auto.punchClock(admin(), ids.employee, { at: day("17:00") });
    expect(r.kind).toBe("clockOut");
    await expect(m.auto.punchClock(admin(), ids.employee, { at: day("18:00") })).rejects.toThrow(/já foram registradas/);
    const { eq, and } = m.orm;
    const [cost] = await m.db.db.select().from(m.s.projectCostEntries).where(and(eq(m.s.projectCostEntries.projectId, projectId), eq(m.s.projectCostEntries.source, "timesheet")));
    // 07h–17h com 1 h de intervalo = 9 h: 8 h × R$ 20 + 1 h extra × R$ 30 (50%) = R$ 190
    expect(cost.amount).toBe(190);
  });

  it("medição: aprovação respeita alçada; faturamento cria conta a receber; recebimento vai ao caixa", async () => {
    const { db } = m.db;
    const { eq } = m.orm;
    const [area] = await db.select().from(m.s.projectAreas).where(eq(m.s.projectAreas.projectId, projectId));
    const meas = await m.ops.createMeasurement(admin(), projectId, { periodStart: "2030-01-10", periodEnd: "2030-01-31", items: [{ areaId: area.id, quantity: 40, unitPrice: 100 }] });
    expect(meas.grossValue).toBe(4_000);
    await expect(m.ops.createMeasurement(admin(), projectId, { periodStart: "2030-02-01", periodEnd: "2030-02-28", items: [{ areaId: area.id, quantity: 61, unitPrice: 100 }] })).rejects.toThrow(/ultrapassa/);
    await m.auto.approveMeasurement(admin(), meas.id);
    const ar = await m.auto.invoiceMeasurement(admin(), meas.id, "2030-02-15");
    expect(ar.amount).toBe(4_000);
    await expect(m.auto.invoiceMeasurement(admin(), meas.id, "2030-02-15")).rejects.toThrow(/aprovadas/);
    const partial = await m.auto.receiveReceivable(admin(), ar.id, { amount: 1_500, date: "2030-02-10", bankAccountId: ids.bank, method: "pix" });
    expect(partial.fullyPaid).toBe(false);
    const full = await m.auto.receiveReceivable(admin(), ar.id, { amount: 2_500, date: "2030-02-15", bankAccountId: ids.bank, method: "pix" });
    expect(full.fullyPaid).toBe(true);
    const [mm] = await db.select().from(m.s.measurements).where(eq(m.s.measurements.id, meas.id));
    expect(mm.status).toBe("recebida");
    await expect(m.auto.receiveReceivable(admin(), ar.id, { amount: 1, date: "2030-02-15", bankAccountId: ids.bank, method: "pix" })).rejects.toThrow(/excede/);
  });

  it("despesa acima da alçada do supervisor fica pendente; aprovada pela diretoria entra no custo da obra", async () => {
    const { db } = m.db;
    const { eq, and } = m.orm;
    const small = await m.auto.createPayable(supervisor(), { description: "Frete", categoryId: ids.catTerc, amount: 300, dueDate: "2030-02-01", projectId });
    expect(small.pendingApproval).toBe(false);
    const big = await m.auto.createPayable(supervisor(), { description: "Andaime", categoryId: ids.catTerc, amount: 2_000, dueDate: "2030-02-01", projectId });
    expect(big.pendingApproval).toBe(true);
    expect(big.requiredRole).toBe("diretoria");
    await expect(m.auto.payPayable(admin(), big.payable.id, { amount: 2_000, date: "2030-02-01", bankAccountId: ids.bank, method: "pix" })).rejects.toThrow(/aguarda aprovação/);
    const [req] = await db.select().from(m.s.approvalRequests).where(eq(m.s.approvalRequests.entityId, big.payable.id));
    await expect(m.auto.decideApproval(supervisor(), req.id, true)).rejects.toThrow();
    await m.auto.decideApproval(admin(), req.id, true);
    const costs = await db.select().from(m.s.projectCostEntries).where(and(eq(m.s.projectCostEntries.projectId, projectId), eq(m.s.projectCostEntries.source, "payable")));
    expect(costs.map((c) => c.amount).sort()).toEqual([2_000, 300]);
  });

  it("teste de estanqueidade reprovado abre não conformidade; entrega com NC crítica é bloqueada", async () => {
    const r = await m.auto.recordTightnessTest(admin(), { projectId, startedAt: new Date("2030-01-20T08:00:00-03:00"), approved: false, result: "vazou" });
    expect(r.nonconformityId).toBeTruthy();
    await m.ops.createNonconformity(admin(), projectId, { title: "Crítica", severity: "critica", isRework: true });
    await expect(m.auto.signDeliveryTerm(admin(), projectId, { deliveredAt: "2030-02-20", companySignerName: "A", clientSignerName: "B" })).rejects.toThrow(/críticas/);
  });
});
