import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { clients, leads, quoteItems, quotes, technicalVisits, users } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { addDays, todayISO } from "@/domain/dates";
import { round2, sumMoney } from "@/domain/money";
import type { Actor } from "./automations";
import { requestApproval } from "./automations";
import { BusinessError, assertFound } from "./errors";

export const LEAD_STAGES = [
  ["lead", "Lead"],
  ["contato", "Contato"],
  ["visita_agendada", "Visita agendada"],
  ["visita_realizada", "Visita realizada"],
  ["orcamento", "Orçamento"],
  ["proposta_enviada", "Proposta enviada"],
  ["negociacao", "Negociação"],
  ["fechado", "Fechado"],
  ["perdido", "Perdido"],
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number][0];

export const LEAD_SOURCES = [
  ["google", "Google"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["indicacao", "Indicação"],
  ["cliente_antigo", "Cliente antigo"],
  ["whatsapp", "WhatsApp"],
  ["site", "Site"],
  ["parceiro", "Parceiro"],
  ["outros", "Outros"],
] as const;

export async function crmBoard(companyId: string) {
  const rows = await db
    .select({ l: leads, seller: users.name, clientName: clients.name })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.sellerId))
    .leftJoin(clients, eq(clients.id, leads.clientId))
    .where(eq(leads.companyId, companyId))
    .orderBy(desc(leads.updatedAt));
  return rows.map((r) => ({ ...r.l, seller: r.seller, clientName: r.clientName }));
}

export function crmIndicators(list: Awaited<ReturnType<typeof crmBoard>>, contractValues: number[]) {
  const won = list.filter((l) => l.stage === "fechado");
  const lost = list.filter((l) => l.stage === "perdido");
  const decided = won.length + lost.length;
  const group = (key: (l: (typeof list)[number]) => string, filter = (l: (typeof list)[number]) => l.stage === "fechado") => {
    const m = new Map<string, { count: number; value: number }>();
    for (const l of list.filter(filter)) {
      const k = key(l);
      const cur = m.get(k) ?? { count: 0, value: 0 };
      cur.count++;
      cur.value += l.estimatedValue ?? 0;
      m.set(k, cur);
    }
    return [...m.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.count - a.count);
  };
  return {
    total: list.length,
    open: list.filter((l) => l.stage !== "fechado" && l.stage !== "perdido").length,
    pipeline: sumMoney(list.filter((l) => l.stage !== "fechado" && l.stage !== "perdido").map((l) => l.estimatedValue)),
    conversion: decided ? (won.length / decided) * 100 : null,
    ticket: contractValues.length ? sumMoney(contractValues) / contractValues.length : null,
    bySeller: group((l) => l.seller ?? "Sem vendedor"),
    bySource: group((l) => LEAD_SOURCES.find((s) => s[0] === l.source)?.[1] ?? l.source, () => true),
    lostReasons: group((l) => l.lostReason ?? "Não informado", (l) => l.stage === "perdido"),
  };
}

export async function quoteTotals(quoteId: string) {
  const [q] = await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId)).orderBy(asc(quoteItems.position));
  return computeQuote(q, items);
}

export function computeQuote(q: typeof quotes.$inferSelect, items: Array<typeof quoteItems.$inferSelect>) {
  const lines = items.map((i) => {
    const total = round2(i.quantity * i.unitPrice);
    const cost = round2(i.quantity * (i.materialUnitCost + i.laborUnitCost));
    return { ...i, total, cost, margin: total ? ((total - cost) / total) * 100 : null };
  });
  const gross = sumMoney(lines.map((l) => l.total));
  const total = round2(gross - q.discount);
  const taxes = round2((total * q.taxRate) / 100);
  const cost = sumMoney(lines.map((l) => l.cost));
  const margin = total ? ((total - taxes - cost) / total) * 100 : null;
  const area = lines.filter((l) => l.unit === "m²").reduce((s, l) => s + l.quantity, 0);
  return { quote: q, lines, gross, total, taxes, cost, margin, area };
}

export interface QuoteInput {
  clientId: string;
  leadId?: string;
  visitId?: string;
  title: string;
  siteAddress?: string;
  siteCity?: string;
  siteState?: string;
  validUntil?: string;
  discount: number;
  taxRate: number;
  paymentTerms?: string;
  executionDays?: number;
  warrantyMonths?: number;
  notes?: string;
  items: Array<{ service: string; description?: string; unit: string; quantity: number; materialUnitCost: number; laborUnitCost: number; unitPrice: number; systemId?: string }>;
}

export async function saveQuote(actor: Actor, input: QuoteInput, quoteId?: string) {
  if (!input.items.length) throw new BusinessError("Inclua pelo menos um item no orçamento.");
  const gross = sumMoney(input.items.map((i) => i.quantity * i.unitPrice));
  if (input.discount > gross) throw new BusinessError("O desconto não pode ser maior que o valor do orçamento.");
  return db.transaction(async (tx) => {
    const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, input.clientId), eq(clients.companyId, actor.companyId))).limit(1);
    assertFound(client, "Cliente");
    let id = quoteId;
    if (id) {
      const [q] = await tx.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.companyId, actor.companyId))).limit(1);
      assertFound(q, "Orçamento");
      if (q.status === "aprovado" || q.status === "reprovado") throw new BusinessError("Orçamento finalizado não pode ser editado. Duplique para criar uma nova versão.");
      const { items: _items, ...header } = input;
      void _items;
      await tx.update(quotes).set(header).where(eq(quotes.id, id));
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, id));
      await audit(tx, actor, "quote.update", "quote", id, { discount: q.discount }, header);
    } else {
      const [{ next }] = await tx.select({ next: sql<string>`coalesce(max(${quotes.number}), 100) + 1` }).from(quotes).where(eq(quotes.companyId, actor.companyId));
      const { items: _items, ...header } = input;
      void _items;
      const [q] = await tx
        .insert(quotes)
        .values({ ...header, companyId: actor.companyId, number: Number(next), validUntil: input.validUntil ?? addDays(todayISO(), 15), createdById: actor.id })
        .returning();
      id = q.id;
      await audit(tx, actor, "quote.create", "quote", id, undefined, header);
      if (input.leadId) await tx.update(leads).set({ stage: "orcamento", clientId: input.clientId }).where(eq(leads.id, input.leadId));
    }
    await tx.insert(quoteItems).values(input.items.map((i, position) => ({ ...i, quoteId: id!, position })));
    // Desconto relevante passa pela alçada (§74)
    if (input.discount > 0) await requestApprovalIfNeeded(tx, actor, id!, input.discount);
    return id!;
  });
}

async function requestApprovalIfNeeded(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], actor: Actor, quoteId: string, discount: number) {
  const [existing] = await tx.execute<{ c: string }>(sql`select count(*) as c from approval_requests where entity_id = ${quoteId} and kind = 'desconto' and status = 'pendente'`).then((r) => r.rows);
  if (Number(existing?.c ?? 0) > 0) return;
  await requestApproval(tx, actor, "desconto", quoteId, discount, `Desconto no orçamento`);
}

export async function duplicateQuote(actor: Actor, quoteId: string) {
  return db.transaction(async (tx) => {
    const [q] = await tx.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId))).limit(1);
    assertFound(q, "Orçamento");
    const items = await tx.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
    const [{ v }] = await tx.select({ v: sql<string>`max(${quotes.version}) + 1` }).from(quotes).where(and(eq(quotes.companyId, actor.companyId), eq(quotes.number, q.number)));
    const { id: _id, createdAt: _c, updatedAt: _u, approvedAt: _a, ...rest } = q;
    void _id; void _c; void _u; void _a;
    const [copy] = await tx
      .insert(quotes)
      .values({ ...rest, version: Number(v), parentQuoteId: q.id, status: "rascunho", validUntil: addDays(todayISO(), 15), createdById: actor.id })
      .returning();
    if (items.length) await tx.insert(quoteItems).values(items.map((it) => ({ position: it.position, service: it.service, description: it.description, unit: it.unit, quantity: it.quantity, materialUnitCost: it.materialUnitCost, laborUnitCost: it.laborUnitCost, unitPrice: it.unitPrice, systemId: it.systemId, quoteId: copy.id })));
    await audit(tx, actor, "quote.duplicate", "quote", copy.id, undefined, { from: quoteId, version: copy.version });
    return copy.id;
  });
}

export async function setQuoteStatus(actor: Actor, quoteId: string, status: "enviado" | "reprovado") {
  const [q] = await db.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.companyId, actor.companyId))).limit(1);
  assertFound(q, "Orçamento");
  if (q.status === "aprovado") throw new BusinessError("Orçamento já aprovado.");
  await db.update(quotes).set({ status }).where(eq(quotes.id, quoteId));
  if (q.leadId) await db.update(leads).set(status === "enviado" ? { stage: "proposta_enviada" } : { stage: "perdido", lostReason: "Proposta reprovada pelo cliente", closedAt: new Date() }).where(eq(leads.id, q.leadId));
  await audit(db, actor, `quote.${status}`, "quote", quoteId, { status: q.status }, { status });
}

export async function visitsList(companyId: string) {
  return db
    .select({ v: technicalVisits, leadName: leads.name, clientName: clients.name, responsible: users.name })
    .from(technicalVisits)
    .leftJoin(leads, eq(leads.id, technicalVisits.leadId))
    .leftJoin(clients, eq(clients.id, technicalVisits.clientId))
    .leftJoin(users, eq(users.id, technicalVisits.responsibleId))
    .where(eq(technicalVisits.companyId, companyId))
    .orderBy(desc(technicalVisits.scheduledAt));
}
