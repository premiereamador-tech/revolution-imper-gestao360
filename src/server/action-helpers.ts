import "server-only";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { AuthError, clientIp, type SessionUser } from "@/server/auth/session";
import type { Actor } from "@/server/services/automations";
import { BusinessError } from "@/server/services/errors";

export async function actorFrom(user: SessionUser): Promise<Actor> {
  return { id: user.id, companyId: user.companyId, roleKey: user.roleKey, ip: await clientIp() };
}

/** Converte FormData em objeto simples (campos vazios viram undefined). */
export function formToObject(fd: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    const t = v.trim();
    out[k] = t === "" ? undefined : t;
  }
  return out;
}

export function parseForm<T extends z.ZodType>(schema: T, fd: FormData): z.infer<T> {
  return schema.parse(formToObject(fd));
}

/** Executa a ação convertendo erros conhecidos em mensagens amigáveis. */
export async function runAction(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    const r = await fn();
    return r ?? { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of e.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: "Revise os campos destacados.", fieldErrors };
    }
    if (e instanceof BusinessError || e instanceof AuthError) return { ok: false, error: e.message };
    const pgCode = (e as { code?: string; cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code;
    if (pgCode === "23505") return { ok: false, error: "Já existe um registro com esses dados (duplicado)." };
    if (pgCode === "23503") return { ok: false, error: "Este registro está vinculado a outros dados e não pode ser alterado assim." };
    console.error("[action]", e);
    return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
  }
}

// Esquemas reutilizáveis (validação no backend)
const brNumber = (v: unknown) => {
  if (typeof v !== "string") return v;
  const s = v.replace(/[R$\s]/g, "");
  // "1.234,56" → 1234.56 ; "1234.56" → 1234.56
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return normalized === "" ? undefined : Number(normalized);
};

export const zMoney = z.preprocess(brNumber, z.number({ error: "Informe um valor" }).finite().min(0, "Não pode ser negativo"));
export const zPositive = z.preprocess(brNumber, z.number({ error: "Informe um número" }).finite().positive("Deve ser maior que zero"));
export const zNumber = z.preprocess(brNumber, z.number({ error: "Informe um número" }).finite());
export const zOptNumber = z.preprocess(brNumber, z.number().finite().optional());
export const zDate = z.string({ error: "Informe a data" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
export const zOptDate = zDate.optional();
export const zUuid = z.string().uuid("Seleção inválida");
export const zOptUuid = z.string().uuid().optional();
export const zText = (max = 200) => z.string({ error: "Campo obrigatório" }).min(1, "Campo obrigatório").max(max, `Máximo de ${max} caracteres`);
export const zOptText = (max = 2000) => z.string().max(max, `Máximo de ${max} caracteres`).optional();
