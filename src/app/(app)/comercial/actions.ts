"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { actorFrom, formToObject, runAction, zDate, zMoney, zOptDate, zOptNumber, zOptText, zOptUuid, zText, zUuid } from "@/server/action-helpers";
import { assertPermission } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { leads, technicalVisits } from "@/server/db/schema";
import { approveQuote } from "@/server/services/automations";
import { duplicateQuote, LEAD_SOURCES, LEAD_STAGES, saveQuote, setQuoteStatus } from "@/server/services/commercial";

const stageEnum = z.enum(LEAD_STAGES.map((s) => s[0]) as [string, ...string[]]);
const sourceEnum = z.enum(LEAD_SOURCES.map((s) => s[0]) as [string, ...string[]]);

export async function createLeadAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("crm:edit");
    const d = z.object({ name: zText(200), phone: zOptText(20), email: z.string().email().optional(), city: zOptText(120), source: sourceEnum, estimatedValue: zOptNumber, description: zOptText(2000), clientId: zOptUuid }).parse(formToObject(fd));
    const [l] = await db.insert(leads).values({ ...d, source: d.source as "outros", companyId: user.companyId, sellerId: user.id }).returning();
    await audit(db, await actorFrom(user), "lead.create", "lead", l.id, undefined, d);
    revalidatePath("/comercial/leads");
    return { ok: true, message: "Lead cadastrado." };
  });
}

export async function moveLeadAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("crm:edit");
    const d = z.object({ id: zUuid, stage: stageEnum, lostReason: zOptText(200) }).parse(formToObject(fd));
    if (d.stage === "perdido" && !d.lostReason) return { ok: false, error: "Informe o motivo da perda.", fieldErrors: { lostReason: "Obrigatório" } };
    const [l] = await db.select().from(leads).where(and(eq(leads.id, d.id), eq(leads.companyId, user.companyId))).limit(1);
    if (!l) return { ok: false, error: "Lead não encontrado." };
    await db
      .update(leads)
      .set({ stage: d.stage as "lead", lostReason: d.stage === "perdido" ? d.lostReason : null, closedAt: d.stage === "fechado" || d.stage === "perdido" ? new Date() : null })
      .where(eq(leads.id, d.id));
    await audit(db, await actorFrom(user), "lead.stage", "lead", d.id, { stage: l.stage }, { stage: d.stage });
    revalidatePath("/comercial/leads");
    return { ok: true };
  });
}

export async function createVisitAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("crm:edit");
    const d = z
      .object({
        leadId: zOptUuid,
        clientId: zOptUuid,
        scheduledAt: z.string().optional(),
        done: z.string().optional(),
        address: zOptText(300),
        latitude: zOptText(20),
        longitude: zOptText(20),
        reportedProblem: zOptText(4000),
        infiltrationType: zOptText(120),
        approxArea: zOptNumber,
        probableCauses: zOptText(4000),
        proposedSolution: zOptText(4000),
        suggestedMaterials: zOptText(2000),
        notes: zOptText(2000),
      })
      .parse(formToObject(fd));
    if (!d.leadId && !d.clientId) return { ok: false, error: "Vincule a visita a um lead ou cliente." };
    const scheduled = d.scheduledAt ? new Date(`${d.scheduledAt}:00-03:00`) : new Date();
    const [v] = await db
      .insert(technicalVisits)
      .values({ ...d, companyId: user.companyId, scheduledAt: scheduled, doneAt: d.done === "on" ? scheduled : null, responsibleId: user.id })
      .returning();
    if (d.leadId) await db.update(leads).set({ stage: d.done === "on" ? "visita_realizada" : "visita_agendada" }).where(and(eq(leads.id, d.leadId), eq(leads.companyId, user.companyId)));
    await audit(db, await actorFrom(user), "visit.create", "technical_visit", v.id, undefined, { leadId: d.leadId });
    revalidatePath("/comercial/leads");
    revalidatePath("/comercial/visitas");
    return { ok: true, message: "Visita registrada." };
  });
}

const itemSchema = z.object({
  service: zText(200),
  description: zOptText(2000),
  unit: z.string().min(1).max(10),
  quantity: zMoney,
  materialUnitCost: zMoney,
  laborUnitCost: zMoney,
  unitPrice: zMoney,
  systemId: zOptUuid,
});

export async function saveQuoteAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("crm:edit");
    const raw = formToObject(fd);
    const header = z
      .object({
        id: zOptUuid,
        clientId: zUuid,
        leadId: zOptUuid,
        visitId: zOptUuid,
        title: zText(200),
        siteAddress: zOptText(300),
        siteCity: zOptText(120),
        siteState: z.string().length(2).optional(),
        validUntil: zOptDate,
        discount: zMoney.default(0),
        taxRate: zMoney.default(0),
        paymentTerms: zOptText(2000),
        executionDays: zOptNumber,
        warrantyMonths: zOptNumber,
        notes: zOptText(4000),
      })
      .parse(raw);
    const idx = [...new Set(Object.keys(raw).filter((k) => k.startsWith("items.")).map((k) => Number(k.split(".")[1])))].sort((a, b) => a - b);
    const items = idx
      .map((i) => ({
        service: raw[`items.${i}.service`],
        description: raw[`items.${i}.description`],
        unit: raw[`items.${i}.unit`] ?? "m²",
        quantity: raw[`items.${i}.quantity`],
        materialUnitCost: raw[`items.${i}.materialUnitCost`] ?? "0",
        laborUnitCost: raw[`items.${i}.laborUnitCost`] ?? "0",
        unitPrice: raw[`items.${i}.unitPrice`],
        systemId: raw[`items.${i}.systemId`],
      }))
      .filter((i) => i.service)
      .map((i, n) => {
        const r = itemSchema.safeParse(i);
        if (!r.success) throw new z.ZodError(r.error.issues.map((iss) => ({ ...iss, path: ["items", n, ...iss.path] })));
        return r.data;
      });
    const { id, ...rest } = header;
    const quoteId = await saveQuote(await actorFrom(user), { ...rest, items }, id);
    revalidatePath("/comercial/orcamentos");
    return { ok: true, redirectTo: `/comercial/orcamentos/${quoteId}` };
  });
}

export async function quoteStatusAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("crm:edit");
    const d = z.object({ id: zUuid, status: z.enum(["enviado", "reprovado"]) }).parse(formToObject(fd));
    await setQuoteStatus(await actorFrom(user), d.id, d.status);
    revalidatePath(`/comercial/orcamentos/${d.id}`);
    return { ok: true, message: d.status === "enviado" ? "Marcado como enviado ao cliente." : "Orçamento reprovado." };
  });
}

export async function duplicateQuoteAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("crm:edit");
    const { id } = z.object({ id: zUuid }).parse(formToObject(fd));
    const copy = await duplicateQuote(await actorFrom(user), id);
    return { ok: true, redirectTo: `/comercial/orcamentos/${copy}/editar` };
  });
}

export async function approveQuoteAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("quotes:approve");
    const d = z
      .object({ id: zUuid, startDate: zDate, billing: z.enum(["parcelas", "medicao"]), downPaymentPct: zMoney.default(0), installments: z.coerce.number().int().min(0).max(48), retentionRate: zOptNumber })
      .parse(formToObject(fd));
    if (d.downPaymentPct > 100) return { ok: false, error: "Entrada não pode passar de 100%." };
    const r = await approveQuote(await actorFrom(user), d.id, d);
    revalidatePath("/obras");
    revalidatePath("/comercial/orcamentos");
    return { ok: true, redirectTo: `/obras/${r.projectId}` };
  });
}
