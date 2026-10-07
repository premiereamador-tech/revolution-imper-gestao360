import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  clients,
  costCenters,
  employees,
  projectBudgets,
  projects,
  projectStatuses,
  roles,
  users,
  warehouses,
} from "@/server/db/schema";
import { audit } from "@/server/audit";
import { addDays } from "@/domain/dates";
import { COST_CATEGORIES, type CostCategory } from "@/domain/project-finance";
import type { Actor } from "./automations";
import { BusinessError } from "./errors";

export async function projectFormOptions(companyId: string) {
  const [clientList, statusList, engineers, foremen] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.companyId, companyId)).orderBy(asc(clients.name)),
    db.select().from(projectStatuses).where(and(eq(projectStatuses.companyId, companyId), eq(projectStatuses.active, true))).orderBy(asc(projectStatuses.position)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(users.companyId, companyId), eq(users.active, true), sql`${roles.key} in ('engenheiro','supervisor','diretoria','admin')`))
      .orderBy(asc(users.name)),
    db
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.status, "ativo"), eq(employees.jobTitle, "Encarregado")))
      .orderBy(asc(employees.name)),
  ]);
  return { clientList, statusList, engineers, foremen };
}

export interface ProjectInput {
  name: string;
  clientId: string;
  statusKey: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  plannedStart?: string;
  contractDays?: number;
  contractValue: number;
  contractedArea: number;
  dailyTargetArea?: number;
  retentionRate?: number;
  warrantyMonths?: number;
  engineerId?: string;
  foremanEmployeeId?: string;
  clientContactName?: string;
  clientContactPhone?: string;
  clientContactEmail?: string;
  paymentMethod?: string;
  notes?: string;
  budget: Partial<Record<CostCategory, number>>;
}

export async function createProject(actor: Actor, input: ProjectInput) {
  return db.transaction(async (tx) => {
    const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, input.clientId), eq(clients.companyId, actor.companyId))).limit(1);
    if (!client) throw new BusinessError("Cliente não encontrado.");
    const [status] = await tx.select().from(projectStatuses).where(and(eq(projectStatuses.companyId, actor.companyId), eq(projectStatuses.key, input.statusKey))).limit(1);
    if (!status) throw new BusinessError("Status inválido.");
    const [r] = await tx
      .select({ max: sql<string>`coalesce(max(substring(${projects.code} from '[0-9]+$')::int), 0)` })
      .from(projects)
      .where(eq(projects.companyId, actor.companyId));
    const code = `OB-${String(Number(r.max) + 1).padStart(3, "0")}`;
    const [project] = await tx
      .insert(projects)
      .values({
        companyId: actor.companyId,
        code,
        name: input.name,
        clientId: input.clientId,
        statusId: status.id,
        zipCode: input.zipCode,
        address: input.address,
        city: input.city,
        state: input.state,
        plannedStart: input.plannedStart,
        contractDays: input.contractDays,
        plannedEnd: input.plannedStart && input.contractDays ? addDays(input.plannedStart, input.contractDays) : null,
        contractValue: input.contractValue,
        contractedArea: input.contractedArea,
        dailyTargetArea: input.dailyTargetArea,
        retentionRate: input.retentionRate ?? 0,
        warrantyMonths: input.warrantyMonths,
        engineerId: input.engineerId,
        foremanEmployeeId: input.foremanEmployeeId,
        clientContactName: input.clientContactName,
        clientContactPhone: input.clientContactPhone,
        clientContactEmail: input.clientContactEmail,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
      })
      .returning();
    // Automação: obra criada → centro de custo + estoque da obra (§73)
    await tx.insert(costCenters).values({ companyId: actor.companyId, code, name: `Obra ${code} — ${input.name}`.slice(0, 160), kind: "obra", projectId: project.id });
    await tx.insert(warehouses).values({ companyId: actor.companyId, name: `Obra ${code}`, type: "obra", projectId: project.id });
    const budgetRows = COST_CATEGORIES.map((category) => ({ projectId: project.id, category, amount: input.budget[category] ?? 0 })).filter((b) => b.amount > 0);
    if (budgetRows.length) await tx.insert(projectBudgets).values(budgetRows);
    await audit(tx, actor, "project.create", "project", project.id, undefined, { ...project, budget: input.budget });
    return project;
  });
}

export async function updateProjectBudget(actor: Actor, projectId: string, budget: Partial<Record<CostCategory, number>>) {
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.companyId, actor.companyId))).limit(1);
    if (!p) throw new BusinessError("Obra não encontrada.");
    const before = await tx.select().from(projectBudgets).where(eq(projectBudgets.projectId, projectId));
    for (const category of COST_CATEGORIES) {
      const amount = budget[category];
      if (amount === undefined) continue;
      await tx
        .insert(projectBudgets)
        .values({ projectId, category, amount })
        .onConflictDoUpdate({ target: [projectBudgets.projectId, projectBudgets.category], set: { amount } });
    }
    await audit(tx, actor, "project.budget", "project", projectId, before, budget);
  });
}

export async function projectsForSelect(companyId: string, onlyOpen = true) {
  return db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .innerJoin(projectStatuses, eq(projectStatuses.id, projects.statusId))
    .where(and(eq(projects.companyId, companyId), onlyOpen ? sql`${projectStatuses.category} in ('pre_obra','ativa','pausada')` : undefined))
    .orderBy(desc(projects.code));
}
