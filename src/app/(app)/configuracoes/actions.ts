"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { DEFAULT_APPROVAL_RULES, type ApprovalKind, type ApprovalRules } from "@/domain/approvals";
import { DEFAULT_HEALTH_THRESHOLDS, type HealthThresholds } from "@/domain/health";
import { ALL_PERMISSIONS } from "@/domain/permissions";
import { actorFrom, formToObject, runAction, zOptNumber, zOptText, zOptUuid, zText, zUuid } from "@/server/action-helpers";
import { hashPassword, passwordPolicyError } from "@/server/auth/password";
import { assertPermission } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { checklistTemplateItems, checklistTemplates, projectStatuses, rolePermissions, roles, sessions, technicalReferences, users } from "@/server/db/schema";
import { getSetting, setSetting } from "@/server/services/settings";

export async function createUserAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await assertPermission("settings:manage");
    const d = z
      .object({ name: zText(120), email: z.string().trim().toLowerCase().email("E-mail inválido"), roleId: zUuid, password: z.string(), employeeId: zOptUuid, clientId: zOptUuid })
      .parse(formToObject(fd));
    const err = passwordPolicyError(d.password);
    if (err) return { ok: false, error: err, fieldErrors: { password: err } };
    const [role] = await db.select().from(roles).where(and(eq(roles.id, d.roleId), eq(roles.companyId, admin.companyId))).limit(1);
    if (!role) return { ok: false, error: "Perfil inválido." };
    const [u] = await db.insert(users).values({ companyId: admin.companyId, roleId: d.roleId, name: d.name, email: d.email, passwordHash: await hashPassword(d.password), employeeId: d.employeeId, clientId: d.clientId }).returning();
    await audit(db, await actorFrom(admin), "user.create", "user", u.id, undefined, { name: d.name, email: d.email, role: role.key });
    revalidatePath("/configuracoes");
    return { ok: true, message: "Usuário criado. Informe a senha inicial à pessoa por um canal seguro." };
  });
}

export async function updateUserAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await assertPermission("settings:manage");
    const d = z.object({ id: zUuid, roleId: zUuid, active: z.enum(["sim", "nao"]), password: z.string().optional() }).parse(formToObject(fd));
    const [u] = await db.select().from(users).where(and(eq(users.id, d.id), eq(users.companyId, admin.companyId))).limit(1);
    if (!u) return { ok: false, error: "Usuário não encontrado." };
    if (u.id === admin.id && d.active === "nao") return { ok: false, error: "Você não pode desativar o próprio usuário." };
    const patch: Partial<typeof users.$inferInsert> = { roleId: d.roleId, active: d.active === "sim" };
    if (d.password) {
      const err = passwordPolicyError(d.password);
      if (err) return { ok: false, error: err };
      patch.passwordHash = await hashPassword(d.password);
      patch.failedLogins = 0;
      patch.lockedUntil = null;
    }
    await db.update(users).set(patch).where(eq(users.id, d.id));
    // Mudança de perfil/senha/desativação encerra sessões abertas do usuário
    await db.delete(sessions).where(eq(sessions.userId, d.id));
    await audit(db, await actorFrom(admin), "user.update", "user", d.id, { roleId: u.roleId, active: u.active }, { roleId: d.roleId, active: d.active, passwordReset: !!d.password });
    revalidatePath("/configuracoes");
    return { ok: true, message: "Usuário atualizado. Sessões abertas foram encerradas." };
  });
}

export async function updateRolePermissionsAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await assertPermission("settings:manage");
    const roleId = zUuid.parse(fd.get("roleId"));
    const [role] = await db.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.companyId, admin.companyId))).limit(1);
    if (!role) return { ok: false, error: "Perfil não encontrado." };
    const selected = fd.getAll("perm").map(String).filter((p) => (ALL_PERMISSIONS as string[]).includes(p));
    if (role.key === "admin" && !selected.includes("settings:manage")) return { ok: false, error: "O perfil Administrador precisa manter acesso às Configurações." };
    const before = await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    await db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (selected.length) await tx.insert(rolePermissions).values(selected.map((permission) => ({ roleId, permission })));
      await audit(tx, await actorFrom(admin), "role.permissions", "role", roleId, before.map((b) => b.permission), selected);
    });
    revalidatePath("/configuracoes");
    return { ok: true, message: `Permissões do perfil ${role.name} salvas.` };
  });
}

export async function updateApprovalRulesAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await assertPermission("settings:manage");
    const raw = formToObject(fd);
    const current = await getSetting<ApprovalRules>(admin.companyId, "approvals.rules", DEFAULT_APPROVAL_RULES);
    const next: ApprovalRules = { ...current };
    for (const kind of Object.keys(DEFAULT_APPROVAL_RULES) as ApprovalKind[]) {
      const limit = zOptNumber.parse(raw[`${kind}.limit`]);
      const role = raw[`${kind}.role`] ?? "supervisor";
      next[kind] = limit && limit > 0 ? [{ maxAmount: limit, role }, { maxAmount: null, role: "diretoria" }] : [{ maxAmount: null, role: "diretoria" }];
    }
    await setSetting(admin.companyId, "approvals.rules", next);
    await audit(db, await actorFrom(admin), "settings.approvals", "settings", "approvals.rules", current, next);
    revalidatePath("/configuracoes");
    return { ok: true, message: "Alçadas de aprovação salvas." };
  });
}

export async function updateParametersAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await assertPermission("settings:manage");
    const raw = formToObject(fd);
    const current = await getSetting<HealthThresholds>(admin.companyId, "health.thresholds", DEFAULT_HEALTH_THRESHOLDS);
    const next = { ...DEFAULT_HEALTH_THRESHOLDS, ...current };
    for (const k of Object.keys(DEFAULT_HEALTH_THRESHOLDS) as Array<keyof HealthThresholds>) {
      const v = zOptNumber.parse(raw[`h.${k}`]);
      if (v !== undefined) next[k] = v;
    }
    const tax = zOptNumber.parse(raw.taxRatePct);
    const minMargin = zOptNumber.parse(raw.minMarginPct);
    await setSetting(admin.companyId, "health.thresholds", next);
    if (tax !== undefined) await setSetting(admin.companyId, "finance.taxRatePct", tax);
    if (minMargin !== undefined) await setSetting(admin.companyId, "finance.minMarginPct", minMargin);
    await audit(db, await actorFrom(admin), "settings.parameters", "settings", "health/finance", current, { ...next, tax, minMargin });
    revalidatePath("/configuracoes");
    return { ok: true, message: "Parâmetros salvos." };
  });
}

export async function updateStatusAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await assertPermission("settings:manage");
    const d = z.object({ id: zUuid, label: zText(60), color: z.enum(["slate", "blue", "cyan", "green", "teal", "amber", "red", "violet"]), active: z.enum(["sim", "nao"]) }).parse(formToObject(fd));
    await db.update(projectStatuses).set({ label: d.label, color: d.color, active: d.active === "sim" }).where(and(eq(projectStatuses.id, d.id), eq(projectStatuses.companyId, admin.companyId)));
    revalidatePath("/configuracoes");
    return { ok: true, message: "Status atualizado." };
  });
}

export async function createChecklistTemplateAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await assertPermission("settings:manage");
    const d = z.object({ name: zText(160), stage: zOptText(80), systemId: zOptUuid, referenceId: zOptUuid, items: zText(6000), photoItems: zOptText(6000) }).parse(formToObject(fd));
    const questions = d.items.split("\n").map((q) => q.trim()).filter(Boolean);
    if (!questions.length) return { ok: false, error: "Informe ao menos um item (um por linha)." };
    const photo = new Set((d.photoItems ?? "").split(",").map((n) => Number(n.trim())).filter(Boolean));
    await db.transaction(async (tx) => {
      const [t] = await tx.insert(checklistTemplates).values({ companyId: admin.companyId, name: d.name, stage: d.stage, systemId: d.systemId, referenceId: d.referenceId }).returning();
      await tx.insert(checklistTemplateItems).values(questions.map((question, i) => ({ templateId: t.id, position: i, question: question.slice(0, 300), photoRequired: photo.has(i + 1) })));
      await audit(tx, await actorFrom(admin), "checklist_template.create", "checklist_template", t.id, undefined, { name: d.name, items: questions.length });
    });
    revalidatePath("/configuracoes");
    return { ok: true, message: "Modelo de checklist criado." };
  });
}

export async function createReferenceAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await assertPermission("settings:manage");
    const d = z.object({ kind: z.enum(["norma", "fabricante", "procedimento_interno"]), code: zText(60), title: zText(200), version: zOptText(40), notes: zOptText(2000) }).parse(formToObject(fd));
    await db.insert(technicalReferences).values({ ...d, companyId: admin.companyId });
    revalidatePath("/configuracoes");
    return { ok: true, message: "Referência técnica cadastrada." };
  });
}
