"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { isValidDocument, onlyDigits } from "@/domain/br";
import { actorFrom, formToObject, runAction, zOptText, zText } from "@/server/action-helpers";
import { assertPermission } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { clients } from "@/server/db/schema";

const schema = z
  .object({
    id: z.string().uuid().optional(),
    personType: z.enum(["PF", "PJ"]),
    name: zText(200),
    tradeName: zOptText(200),
    document: zOptText(18),
    email: z.string().email("E-mail inválido").optional(),
    phone: zOptText(20),
    whatsapp: zOptText(20),
    contactName: zOptText(120),
    zipCode: zOptText(9),
    street: zOptText(200),
    number: zOptText(20),
    complement: zOptText(100),
    district: zOptText(120),
    city: zOptText(120),
    state: z.string().length(2).optional(),
    notes: zOptText(4000),
  })
  .superRefine((d, ctx) => {
    if (d.document && !isValidDocument(d.document)) ctx.addIssue({ code: "custom", path: ["document"], message: d.personType === "PF" ? "CPF inválido" : "CNPJ inválido" });
    if (d.document && d.personType === "PF" && onlyDigits(d.document).length !== 11) ctx.addIssue({ code: "custom", path: ["document"], message: "Pessoa física usa CPF" });
    if (d.document && d.personType === "PJ" && onlyDigits(d.document).length !== 14) ctx.addIssue({ code: "custom", path: ["document"], message: "Pessoa jurídica usa CNPJ" });
  });

export async function saveClientAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("clients:edit");
    const d = schema.parse(formToObject(fd));
    const { id, ...data } = d;
    const values = {
      ...data,
      document: data.document ? onlyDigits(data.document) : null,
      phone: data.phone ? onlyDigits(data.phone) : null,
      whatsapp: data.whatsapp ? onlyDigits(data.whatsapp) : null,
      zipCode: data.zipCode ? onlyDigits(data.zipCode) : null,
    };
    const actor = await actorFrom(user);
    if (id) {
      const [before] = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.companyId, user.companyId))).limit(1);
      if (!before) return { ok: false, error: "Cliente não encontrado." };
      await db.update(clients).set(values).where(eq(clients.id, id));
      await audit(db, actor, "client.update", "client", id, before, values);
      revalidatePath(`/clientes/${id}`);
      return { ok: true, message: "Cliente atualizado." };
    }
    const [c] = await db.insert(clients).values({ ...values, companyId: user.companyId }).returning();
    await audit(db, actor, "client.create", "client", c.id, undefined, c);
    revalidatePath("/clientes");
    return { ok: true, redirectTo: `/clientes/${c.id}` };
  });
}
