"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { loginLimiter } from "@/server/auth/rate-limit";
import { clientIp, createSession, destroySession, getCurrentUser } from "@/server/auth/session";
import { audit } from "@/server/audit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
  next: z.string().optional(),
});

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const GENERIC = "E-mail ou senha incorretos.";
/** Hash descartável para igualar o tempo de resposta quando o e-mail não existe. */
let dummyHash: Promise<string> | null = null;

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse({ email: fd.get("email"), password: fd.get("password"), next: fd.get("next") || undefined });
  if (!parsed.success) return { ok: false, error: "Preencha e-mail e senha." };
  const { email, password, next } = parsed.data;

  const ip = (await clientIp()) ?? "unknown";
  const limit = loginLimiter.hit(`${ip}:${email}`);
  if (!limit.allowed) return { ok: false, error: `Muitas tentativas. Aguarde ${Math.ceil(limit.retryAfterSec / 60)} min e tente de novo.` };

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !user.active) {
    dummyHash ??= hashPassword("revolution-dummy-password-0");
    await verifyPassword(password, await dummyHash);
    return { ok: false, error: GENERIC };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "Conta temporariamente bloqueada por tentativas incorretas. Tente mais tarde." };
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await db
      .update(users)
      .set({ failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(users.id, user.id));
    await audit(db, { id: user.id, companyId: user.companyId, ip }, "auth.login_failed", "user", user.id);
    return { ok: false, error: GENERIC };
  }

  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);
  loginLimiter.reset(`${ip}:${email}`);
  await audit(db, { id: user.id, companyId: user.companyId, ip }, "auth.login", "user", user.id);

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/inicio";
  redirect(safeNext);
}

export async function logoutAction() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit(db, { id: user.id, companyId: user.companyId }, "auth.logout", "user", user.id);
  redirect("/login");
}
