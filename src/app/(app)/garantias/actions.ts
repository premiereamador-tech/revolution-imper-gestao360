"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { todayISO } from "@/domain/dates";
import { actorFrom, formToObject, runAction, zOptDate, zOptNumber, zOptText, zOptUuid, zText, zUuid } from "@/server/action-helpers";
import { assertPermission } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { clients, serviceRequests, warranties } from "@/server/db/schema";

export async function serviceRequestAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("projects:edit");
    const d = z.object({ clientId: zUuid, projectId: zOptUuid, kind: z.enum(["garantia", "manutencao", "novo_servico"]), problem: zText(4000), visitAt: zOptDate }).parse(formToObject(fd));
    const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, d.clientId), eq(clients.companyId, user.companyId))).limit(1);
    if (!c) return { ok: false, error: "Cliente inválido." };
    let warrantyId: string | null = null;
    if (d.kind === "garantia" && d.projectId) {
      const [w] = await db.select().from(warranties).where(eq(warranties.projectId, d.projectId)).limit(1);
      if (!w) return { ok: false, error: "Esta obra não possui garantia registrada. Classifique como manutenção ou novo serviço." };
      if (w.endsAt < todayISO()) return { ok: false, error: `Garantia encerrada em ${w.endsAt.split("-").reverse().join("/")}. Classifique como manutenção.` };
      warrantyId = w.id;
    }
    const [r] = await db
      .insert(serviceRequests)
      .values({ ...d, companyId: user.companyId, warrantyId, openedAt: todayISO(), status: d.visitAt ? "visita_agendada" : "aberta", responsibleId: user.id })
      .returning();
    await audit(db, await actorFrom(user), "service_request.create", "service_request", r.id, undefined, d);
    revalidatePath("/garantias");
    return { ok: true, message: "Chamado aberto." };
  });
}

export async function updateServiceRequestAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("projects:edit");
    const d = z.object({ id: zUuid, status: z.enum(["aberta", "visita_agendada", "em_atendimento", "resolvida", "improcedente"]), visitAt: zOptDate, solution: zOptText(4000), cost: zOptNumber }).parse(formToObject(fd));
    const [r] = await db.select().from(serviceRequests).where(and(eq(serviceRequests.id, d.id), eq(serviceRequests.companyId, user.companyId))).limit(1);
    if (!r) return { ok: false, error: "Chamado não encontrado." };
    await db.update(serviceRequests).set({ status: d.status, visitAt: d.visitAt ?? null, solution: d.solution, cost: d.cost ?? 0 }).where(eq(serviceRequests.id, d.id));
    await audit(db, await actorFrom(user), "service_request.update", "service_request", d.id, { status: r.status }, d);
    revalidatePath("/garantias");
    return { ok: true, message: "Chamado atualizado." };
  });
}
