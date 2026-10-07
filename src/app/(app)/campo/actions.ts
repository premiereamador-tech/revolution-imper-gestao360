"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { actorFrom, formToObject, runAction, zOptUuid, zUuid } from "@/server/action-helpers";
import { assertPermission } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { checklistAnswers, checklists, checklistTemplateItems, checklistTemplates, projects } from "@/server/db/schema";
import { saveUpload } from "@/server/storage";
import { addProjectPhoto } from "@/server/services/operations";

/** Preenche um checklist de liberação de etapa (pode chegar pela fila offline). */
export async function submitChecklistAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("field:use");
    const raw = formToObject(fd);
    const d = z.object({ projectId: zUuid, templateId: zUuid, areaId: zOptUuid, checklistId: zOptUuid, clientUuid: z.string().uuid() }).parse(raw);
    const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, d.projectId), eq(projects.companyId, user.companyId))).limit(1);
    if (!p) return { ok: false, error: "Obra não encontrada." };
    const [dup] = await db.select({ id: checklists.id }).from(checklists).where(eq(checklists.clientUuid, d.clientUuid)).limit(1);
    if (dup) return { ok: true, message: "Checklist já enviado." };
    const [tpl] = await db.select().from(checklistTemplates).where(and(eq(checklistTemplates.id, d.templateId), eq(checklistTemplates.companyId, user.companyId))).limit(1);
    if (!tpl) return { ok: false, error: "Modelo de checklist não encontrado." };
    const items = await db.select().from(checklistTemplateItems).where(eq(checklistTemplateItems.templateId, d.templateId));
    const answers = items.map((i) => ({ item: i, answer: raw[`q_${i.id}`] as "sim" | "nao" | "na" | undefined, notes: raw[`n_${i.id}`] }));
    const missing = answers.filter((a) => a.item.required && !a.answer);
    if (missing.length) return { ok: false, error: `Responda todos os itens obrigatórios (${missing.length} pendente(s)).` };
    const actor = await actorFrom(user);

    // Fotos obrigatórias por item
    const photoIds = new Map<string, string>();
    for (const a of answers.filter((x) => x.item.photoRequired)) {
      const file = fd.get(`f_${a.item.id}`);
      if (file instanceof File && file.size > 0) {
        const saved = await saveUpload(user.companyId, user.id, file, `obras/${d.projectId}/checklists`);
        photoIds.set(a.item.id, saved.id);
        await addProjectPhoto(actor, d.projectId, { fileId: saved.id, stage: "durante", areaId: d.areaId, caption: `Checklist: ${a.item.question}`.slice(0, 200) });
      } else if (a.answer === "sim") {
        return { ok: false, error: `Foto obrigatória no item "${a.item.question}".` };
      }
    }
    const failed = answers.some((a) => a.answer === "nao" && a.item.required);
    await db.transaction(async (tx) => {
      let checklistId = d.checklistId;
      if (checklistId) {
        await tx.update(checklists).set({ status: failed ? "reprovado" : "aprovado", filledById: user.id, completedAt: new Date(), clientUuid: d.clientUuid, areaId: d.areaId }).where(eq(checklists.id, checklistId));
        await tx.delete(checklistAnswers).where(eq(checklistAnswers.checklistId, checklistId));
      } else {
        const [c] = await tx
          .insert(checklists)
          .values({ templateId: d.templateId, projectId: d.projectId, areaId: d.areaId, status: failed ? "reprovado" : "aprovado", clientUuid: d.clientUuid, filledById: user.id, completedAt: new Date() })
          .returning();
        checklistId = c.id;
      }
      const rows = answers.filter((a) => a.answer).map((a) => ({ checklistId: checklistId!, itemId: a.item.id, answer: a.answer!, notes: a.notes, photoFileId: photoIds.get(a.item.id) }));
      if (rows.length) await tx.insert(checklistAnswers).values(rows);
      await audit(tx, actor, "checklist.submit", "checklist", checklistId!, undefined, { status: failed ? "reprovado" : "aprovado" });
    });
    revalidatePath(`/obras/${d.projectId}`);
    return { ok: true, message: failed ? "Checklist registrado com pendências: a etapa NÃO está liberada." : "Checklist aprovado: etapa liberada." };
  });
}

