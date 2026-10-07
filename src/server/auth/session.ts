import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/server/db";
import { rolePermissions, roles, sessions, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { hasPermission, type Permission } from "@/domain/permissions";

export const SESSION_COOKIE = "ri_session";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  companyId: string;
  roleKey: string;
  roleName: string;
  employeeId: string | null;
  clientId: string | null;
  permissions: Set<string>;
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000);
  const h = await headers();
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt,
    ip: await clientIp(),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** Usuário da requisição atual (memoizado por requisição). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      companyId: users.companyId,
      active: users.active,
      employeeId: users.employeeId,
      clientId: users.clientId,
      roleId: roles.id,
      roleKey: roles.key,
      roleName: roles.name,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || !row.active) return null;

  const perms = await db
    .select({ p: rolePermissions.permission })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, row.roleId));

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    companyId: row.companyId,
    roleKey: row.roleKey,
    roleName: row.roleName,
    employeeId: row.employeeId,
    clientId: row.clientId,
    permissions: new Set(perms.map((p) => p.p)),
  };
});

/** Para páginas: exige login e, opcionalmente, permissão. */
export async function requireUser(permission?: Permission | Permission[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (permission && !hasPermission(user.permissions, permission)) redirect("/sem-permissao");
  return user;
}

export class AuthError extends Error {}

/** Para server actions / route handlers: lança erro em vez de redirecionar. */
export async function assertPermission(permission: Permission | Permission[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Sessão expirada. Entre novamente.");
  if (!hasPermission(user.permissions, permission)) throw new AuthError("Você não tem permissão para esta ação.");
  return user;
}

export function can(user: SessionUser, permission: Permission | Permission[]) {
  return hasPermission(user.permissions, permission);
}
