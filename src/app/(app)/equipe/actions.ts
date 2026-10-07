"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { isValidCPF, onlyDigits } from "@/domain/br";
import { addDays, addMonths } from "@/domain/dates";
import { actorFrom, formToObject, runAction, zDate, zOptDate, zOptNumber, zOptText, zOptUuid, zText, zUuid } from "@/server/action-helpers";
import { assertPermission, getCurrentUser, AuthError } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { employees, employeeTrainings, ppeDeliveries, ppeItems, projects, projectTeamAssignments, teamMembers, teams, timeEntries, trainings } from "@/server/db/schema";
import { punchClock } from "@/server/services/automations";
import { BusinessError } from "@/server/services/errors";

const employeeSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: zText(160),
    cpf: zOptText(14),
    rg: zOptText(20),
    phone: zOptText(20),
    address: zOptText(300),
    jobTitle: zText(80),
    role: zOptText(80),
    admissionDate: zOptDate,
    salary: zOptNumber,
    employmentType: z.enum(["clt", "diarista", "pj", "autonomo", "estagio"]),
    dailyRate: zOptNumber,
    hourlyRate: zOptNumber,
    pixKey: zOptText(120),
    bankName: zOptText(80),
    emergencyContact: zOptText(200),
    status: z.enum(["ativo", "afastado", "ferias", "desligado"]).default("ativo"),
    notes: zOptText(2000),
  })
  .superRefine((d, ctx) => {
    if (d.cpf && !isValidCPF(d.cpf)) ctx.addIssue({ code: "custom", path: ["cpf"], message: "CPF inválido" });
  });

export async function saveEmployeeAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("employees:edit");
    const sensitive = user.permissions.has("employees:sensitive");
    const d = employeeSchema.parse(formToObject(fd));
    const { id, ...rest } = d;
    const values: Partial<typeof employees.$inferInsert> = { ...rest, cpf: rest.cpf ? onlyDigits(rest.cpf) : null, phone: rest.phone ? onlyDigits(rest.phone) : null, hourlyRate: rest.hourlyRate ?? 0 };
    if (!sensitive) {
      // Quem não vê dados sensíveis não pode alterá-los
      delete values.salary;
      delete values.pixKey;
      delete values.bankName;
      delete values.hourlyRate;
      delete values.dailyRate;
    }
    const actor = await actorFrom(user);
    if (id) {
      const [before] = await db.select().from(employees).where(and(eq(employees.id, id), eq(employees.companyId, user.companyId))).limit(1);
      if (!before) return { ok: false, error: "Funcionário não encontrado." };
      await db.update(employees).set(values).where(eq(employees.id, id));
      await audit(db, actor, "employee.update", "employee", id, before, values);
      revalidatePath(`/equipe/funcionarios/${id}`);
      return { ok: true, message: "Cadastro atualizado." };
    }
    const [e] = await db.insert(employees).values({ ...values, companyId: user.companyId, name: d.name, jobTitle: d.jobTitle } as typeof employees.$inferInsert).returning();
    await audit(db, actor, "employee.create", "employee", e.id, undefined, { name: e.name });
    revalidatePath("/equipe/funcionarios");
    return { ok: true, redirectTo: `/equipe/funcionarios/${e.id}` };
  });
}

/** Ponto: o próprio funcionário (timesheet:self) ou o encarregado/supervisor (timesheet:manage). */
export async function punchAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new AuthError("Sessão expirada.");
    const d = z
      .object({ employeeId: zUuid, projectId: zOptUuid, latitude: zOptText(20), longitude: zOptText(20), clientUuid: z.string().uuid().optional(), at: z.string().optional() })
      .parse(formToObject(fd));
    const self = user.employeeId === d.employeeId && user.permissions.has("timesheet:self");
    if (!self && !user.permissions.has("timesheet:manage")) throw new AuthError("Você só pode bater o próprio ponto.");
    // Batidas offline chegam com o horário em que foram feitas (limitado às últimas 24 h)
    let at: Date | undefined;
    if (d.at) {
      const t = new Date(d.at);
      if (Number.isNaN(t.getTime()) || t > new Date(Date.now() + 5 * 60_000) || t < new Date(Date.now() - 24 * 3_600_000)) throw new BusinessError("Horário da batida inválido.");
      at = t;
    }
    const r = await punchClock(await actorFrom(user), d.employeeId, { ...d, at });
    revalidatePath("/campo");
    revalidatePath("/equipe/ponto");
    const label = { clockIn: "Entrada", breakStart: "Início do intervalo", breakEnd: "Fim do intervalo", clockOut: "Saída" }[r.kind];
    return { ok: true, message: `${label} registrada às ${r.at.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}.` };
  });
}

export async function absenceAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("timesheet:manage");
    const d = z.object({ employeeId: zUuid, date: zDate, type: z.enum(["falta", "atestado", "folga", "ferias"]), notes: zOptText(300) }).parse(formToObject(fd));
    const [emp] = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, d.employeeId), eq(employees.companyId, user.companyId))).limit(1);
    if (!emp) return { ok: false, error: "Funcionário não encontrado." };
    const [existing] = await db.select().from(timeEntries).where(and(eq(timeEntries.employeeId, d.employeeId), eq(timeEntries.date, d.date))).limit(1);
    if (existing?.clockIn) return { ok: false, error: "Já existe batida de ponto neste dia. Ajuste o registro antes." };
    if (existing) await db.update(timeEntries).set({ type: d.type, notes: d.notes }).where(eq(timeEntries.id, existing.id));
    else await db.insert(timeEntries).values({ employeeId: d.employeeId, date: d.date, type: d.type, notes: d.notes });
    await audit(db, await actorFrom(user), "timesheet.absence", "time_entry", d.employeeId, undefined, d);
    revalidatePath("/equipe/ponto");
    return { ok: true, message: "Registro salvo." };
  });
}

export async function createTeamAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("employees:edit");
    const d = z.object({ name: zText(80), foremanId: zOptUuid }).parse(formToObject(fd));
    const [t] = await db.insert(teams).values({ companyId: user.companyId, ...d }).returning();
    if (d.foremanId) await db.insert(teamMembers).values({ teamId: t.id, employeeId: d.foremanId, roleInTeam: "encarregado" });
    revalidatePath("/equipe/equipes");
    return { ok: true, message: "Equipe criada." };
  });
}

export async function addMemberAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("employees:edit");
    const d = z.object({ teamId: zUuid, employeeId: zUuid, roleInTeam: z.enum(["encarregado", "aplicador", "ajudante"]) }).parse(formToObject(fd));
    const [t] = await db.select().from(teams).where(and(eq(teams.id, d.teamId), eq(teams.companyId, user.companyId))).limit(1);
    if (!t) return { ok: false, error: "Equipe não encontrada." };
    await db.insert(teamMembers).values(d).onConflictDoUpdate({ target: [teamMembers.teamId, teamMembers.employeeId], set: { roleInTeam: d.roleInTeam } });
    revalidatePath("/equipe/equipes");
    return { ok: true, message: "Membro adicionado." };
  });
}

export async function removeMemberAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("employees:edit");
    const d = z.object({ teamId: zUuid, employeeId: zUuid }).parse(formToObject(fd));
    const [t] = await db.select().from(teams).where(and(eq(teams.id, d.teamId), eq(teams.companyId, user.companyId))).limit(1);
    if (!t) return { ok: false, error: "Equipe não encontrada." };
    await db.delete(teamMembers).where(and(eq(teamMembers.teamId, d.teamId), eq(teamMembers.employeeId, d.employeeId)));
    revalidatePath("/equipe/equipes");
    return { ok: true };
  });
}

export async function assignTeamAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission(["employees:edit", "projects:edit"]);
    const d = z.object({ teamId: zUuid, projectId: zUuid, startDate: zDate }).parse(formToObject(fd));
    const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, d.projectId), eq(projects.companyId, user.companyId))).limit(1);
    if (!p) return { ok: false, error: "Obra não encontrada." };
    // encerra a alocação atual da equipe
    const current = await db.select().from(projectTeamAssignments).where(eq(projectTeamAssignments.teamId, d.teamId));
    for (const c of current.filter((x) => !x.endDate)) await db.update(projectTeamAssignments).set({ endDate: addDays(d.startDate, -1) }).where(eq(projectTeamAssignments.id, c.id));
    await db.insert(projectTeamAssignments).values(d);
    await audit(db, await actorFrom(user), "team.assign", "team", d.teamId, undefined, d);
    revalidatePath("/equipe/equipes");
    return { ok: true, message: "Equipe alocada na obra." };
  });
}

export async function ppeDeliveryAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("employees:edit");
    const d = z.object({ employeeId: zUuid, ppeItemId: zUuid, quantity: zOptNumber, deliveredAt: zDate }).parse(formToObject(fd));
    const [item] = await db.select().from(ppeItems).where(and(eq(ppeItems.id, d.ppeItemId), eq(ppeItems.companyId, user.companyId))).limit(1);
    if (!item) return { ok: false, error: "EPI não encontrado." };
    await db.insert(ppeDeliveries).values({ ...d, quantity: d.quantity ?? 1, nextReplacementAt: item.replacementDays ? addDays(d.deliveredAt, Number(item.replacementDays)) : null, deliveredById: user.id });
    revalidatePath("/equipe/seguranca");
    return { ok: true, message: "Entrega de EPI registrada." };
  });
}

export async function trainingAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("employees:edit");
    const d = z.object({ employeeId: zUuid, trainingId: zUuid, completedAt: zDate, notes: zOptText(500) }).parse(formToObject(fd));
    const [t] = await db.select().from(trainings).where(and(eq(trainings.id, d.trainingId), eq(trainings.companyId, user.companyId))).limit(1);
    if (!t) return { ok: false, error: "Treinamento não encontrado." };
    const months = Number(t.validityMonths ?? 0);
    await db.insert(employeeTrainings).values({ ...d, validUntil: months ? addMonths(d.completedAt, months) : null });
    revalidatePath("/equipe/seguranca");
    return { ok: true, message: "Treinamento registrado." };
  });
}
