"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import type { ActionResult } from "@/lib/action-result";
import { actorFrom, formToObject, runAction, zDate, zOptDate, zOptNumber, zOptText, zOptUuid, zPositive, zText, zUuid } from "@/server/action-helpers";
import { assertPermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { accountsReceivable, clients } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { createPayable, decideApproval, payPayable, receiveReceivable } from "@/server/services/automations";
import { splitInstallments } from "@/domain/money";
import { addMonths } from "@/domain/dates";

const methods = z.enum(["pix", "boleto", "transferencia", "cartao", "dinheiro", "cheque"]);

export async function receiveAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("finance:settle");
    const d = z.object({ id: zUuid, amount: zPositive, date: zDate, bankAccountId: zUuid, method: methods, interest: zOptNumber, discount: zOptNumber }).parse(formToObject(fd));
    const r = await receiveReceivable(await actorFrom(user), d.id, d);
    revalidatePath("/financeiro", "layout");
    return { ok: true, message: r.fullyPaid ? "Recebimento registrado. Título quitado." : `Recebimento parcial registrado. Saldo: R$ ${r.balance.toFixed(2).replace(".", ",")}.` };
  });
}

export async function payAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("finance:settle");
    const d = z.object({ id: zUuid, amount: zPositive, date: zDate, bankAccountId: zUuid, method: methods }).parse(formToObject(fd));
    const r = await payPayable(await actorFrom(user), d.id, d);
    revalidatePath("/financeiro", "layout");
    return { ok: true, message: r.fullyPaid ? "Pagamento registrado." : "Pagamento parcial registrado." };
  });
}

export async function createPayableAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("finance:edit");
    const d = z
      .object({
        description: zText(200),
        categoryId: zUuid,
        amount: zPositive,
        dueDate: zDate,
        competenceDate: zOptDate,
        supplierId: zOptUuid,
        employeeId: zOptUuid,
        projectId: zOptUuid,
        documentNumber: zOptText(40),
        installments: z.coerce.number().int().min(1).max(48).default(1),
      })
      .parse(formToObject(fd));
    const actor = await actorFrom(user);
    const parts = splitInstallments(d.amount, d.installments);
    let pending = 0;
    let required = "";
    for (const [i, amount] of parts.entries()) {
      const r = await createPayable(actor, {
        ...d,
        amount,
        description: d.installments > 1 ? `${d.description} (${i + 1}/${d.installments})` : d.description,
        dueDate: addMonths(d.dueDate, i),
        competenceDate: d.competenceDate ?? d.dueDate,
      });
      if (r.pendingApproval) {
        pending++;
        required = r.requiredRole;
      }
    }
    revalidatePath("/financeiro", "layout");
    return { ok: true, message: pending ? `Lançado. ${pending} parcela(s) aguardando aprovação de: ${required}.` : "Conta a pagar lançada." };
  });
}

export async function createReceivableAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("finance:edit");
    const d = z
      .object({ clientId: zUuid, projectId: zOptUuid, description: zText(200), amount: zPositive, dueDate: zDate, installments: z.coerce.number().int().min(1).max(48).default(1) })
      .parse(formToObject(fd));
    const [client] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, d.clientId), eq(clients.companyId, user.companyId))).limit(1);
    if (!client) return { ok: false, error: "Cliente inválido." };
    const actor = await actorFrom(user);
    const parts = splitInstallments(d.amount, d.installments);
    await db.transaction(async (tx) => {
      const rows = await tx
        .insert(accountsReceivable)
        .values(parts.map((amount, i) => ({ companyId: user.companyId, clientId: d.clientId, projectId: d.projectId, description: d.installments > 1 ? `${d.description} (${i + 1}/${d.installments})` : d.description, installment: i + 1, installmentsTotal: d.installments, dueDate: addMonths(d.dueDate, i), amount })))
        .returning({ id: accountsReceivable.id });
      await audit(tx, actor, "receivable.create", "accounts_receivable", rows[0].id, undefined, d);
    });
    revalidatePath("/financeiro", "layout");
    return { ok: true, message: "Conta a receber lançada." };
  });
}

export async function cancelReceivableAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("finance:edit");
    const { id, reason } = z.object({ id: zUuid, reason: zText(200) }).parse(formToObject(fd));
    const [r] = await db.select().from(accountsReceivable).where(and(eq(accountsReceivable.id, id), eq(accountsReceivable.companyId, user.companyId))).limit(1);
    if (!r) return { ok: false, error: "Título não encontrado." };
    if (r.receivedAmount > 0) return { ok: false, error: "Título com recebimento não pode ser cancelado." };
    await db.update(accountsReceivable).set({ cancelled: true }).where(eq(accountsReceivable.id, id));
    await audit(db, await actorFrom(user), "receivable.cancel", "accounts_receivable", id, { cancelled: false }, { cancelled: true, reason });
    revalidatePath("/financeiro", "layout");
    return { ok: true, message: "Título cancelado." };
  });
}

export async function decideApprovalAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("approvals:decide");
    const d = z.object({ id: zUuid, decision: z.enum(["aprovar", "reprovar"]), comment: zOptText(300) }).parse(formToObject(fd));
    await decideApproval(await actorFrom(user), d.id, d.decision === "aprovar", d.comment);
    revalidatePath("/aprovacoes");
    revalidatePath("/financeiro", "layout");
    return { ok: true, message: d.decision === "aprovar" ? "Aprovado." : "Reprovado." };
  });
}

