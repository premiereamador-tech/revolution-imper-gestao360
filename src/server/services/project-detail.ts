import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  accountsPayable,
  accountsReceivable,
  checklists,
  checklistTemplates,
  clients,
  contractAdditions,
  contracts,
  dailyLogs,
  deliveryTerms,
  employees,
  measurementItems,
  measurements,
  nonconformities,
  productBatches,
  products,
  projectAreas,
  projectBudgets,
  projectCostEntries,
  projectPhases,
  projects,
  projectTasks,
  projectTeamAssignments,
  projectPhotos,
  serviceRequests,
  stockMovements,
  teamMembers,
  teams,
  tightnessTests,
  timeEntries,
  users,
  warehouses,
  waterproofingApplications,
  waterproofingSystems,
  applicationTypes,
  equipment,
  warranties,
} from "@/server/db/schema";
import { addDays, diffDays, todayISO } from "@/domain/dates";

export async function projectCore(companyId: string, id: string) {
  const [row] = await db
    .select({ p: projects, client: clients, contract: contracts, engineer: users.name })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(contracts, eq(contracts.id, projects.contractId))
    .leftJoin(users, eq(users.id, projects.engineerId))
    .where(and(eq(projects.id, id), eq(projects.companyId, companyId)))
    .limit(1);
  if (!row) return null;
  const foreman = row.p.foremanEmployeeId
    ? (await db.select({ name: employees.name }).from(employees).where(eq(employees.id, row.p.foremanEmployeeId)).limit(1))[0]?.name
    : null;
  return { ...row, foreman };
}

export async function projectAreasWithApps(projectId: string) {
  const areas = await db
    .select({ a: projectAreas, typeName: applicationTypes.name })
    .from(projectAreas)
    .leftJoin(applicationTypes, eq(applicationTypes.id, projectAreas.applicationTypeId))
    .where(eq(projectAreas.projectId, projectId))
    .orderBy(asc(projectAreas.createdAt));
  const ids = areas.map((a) => a.a.id);
  const apps = ids.length
    ? await db
        .select({ app: waterproofingApplications, systemName: waterproofingSystems.name, productName: products.name, productUnit: products.unit, teamName: teams.name })
        .from(waterproofingApplications)
        .innerJoin(waterproofingSystems, eq(waterproofingSystems.id, waterproofingApplications.systemId))
        .leftJoin(products, eq(products.id, waterproofingApplications.productId))
        .leftJoin(teams, eq(teams.id, waterproofingApplications.teamId))
        .where(inArray(waterproofingApplications.areaId, ids))
    : [];
  return areas.map((a) => ({ ...a.a, typeName: a.typeName, applications: apps.filter((x) => x.app.areaId === a.a.id) }));
}

export async function projectFinanceDetail(projectId: string) {
  const [budgets, costs, entries, receivables, payables] = await Promise.all([
    db.select().from(projectBudgets).where(eq(projectBudgets.projectId, projectId)),
    db.select({ category: projectCostEntries.category, total: sql<string>`sum(${projectCostEntries.amount})` }).from(projectCostEntries).where(eq(projectCostEntries.projectId, projectId)).groupBy(projectCostEntries.category),
    db.select().from(projectCostEntries).where(eq(projectCostEntries.projectId, projectId)).orderBy(desc(projectCostEntries.date), desc(projectCostEntries.createdAt)).limit(25),
    db.select().from(accountsReceivable).where(and(eq(accountsReceivable.projectId, projectId), eq(accountsReceivable.cancelled, false))).orderBy(asc(accountsReceivable.dueDate)),
    db.select().from(accountsPayable).where(and(eq(accountsPayable.projectId, projectId), eq(accountsPayable.cancelled, false))).orderBy(asc(accountsPayable.dueDate)),
  ]);
  return { budgets, costs, entries, receivables, payables };
}

export async function projectAdditions(contractId: string | null) {
  if (!contractId) return [];
  return db.select().from(contractAdditions).where(eq(contractAdditions.contractId, contractId)).orderBy(asc(contractAdditions.number));
}

export async function projectSchedule(projectId: string) {
  const [phases, tasks] = await Promise.all([
    db.select().from(projectPhases).where(eq(projectPhases.projectId, projectId)).orderBy(asc(projectPhases.position)),
    db
      .select({ t: projectTasks, responsible: users.name })
      .from(projectTasks)
      .leftJoin(users, eq(users.id, projectTasks.responsibleId))
      .where(eq(projectTasks.projectId, projectId))
      .orderBy(asc(projectTasks.position), asc(projectTasks.plannedStart)),
  ]);
  return { phases, tasks: tasks.map((x) => ({ ...x.t, responsible: x.responsible })) };
}

/** Curva S: avanço físico planejado (cronograma) × realizado (diários) × financeiro (custos ÷ custo projetado). */
export async function sCurve(projectId: string, plannedStart: string | null, plannedEnd: string | null, contractedArea: number, projectedCost: number) {
  if (!plannedStart || !plannedEnd) return [];
  const today = todayISO();
  const [logs, costs] = await Promise.all([
    db.select({ date: dailyLogs.date, area: dailyLogs.executedArea }).from(dailyLogs).where(eq(dailyLogs.projectId, projectId)).orderBy(asc(dailyLogs.date)),
    db.select({ date: projectCostEntries.date, amount: projectCostEntries.amount }).from(projectCostEntries).where(eq(projectCostEntries.projectId, projectId)).orderBy(asc(projectCostEntries.date)),
  ]);
  const total = Math.max(diffDays(plannedStart, plannedEnd), 1);
  const lastDate = logs.length && logs[logs.length - 1].date > plannedEnd ? logs[logs.length - 1].date : plannedEnd;
  const span = Math.max(diffDays(plannedStart, lastDate), 1);
  const step = Math.max(Math.round(span / 24), 1);
  const points = [];
  for (let i = 0; i <= span; i += step) {
    const date = addDays(plannedStart, i);
    const t = Math.min(i / total, 1);
    const planned = 100 * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2); // curva S suave
    const executed = logs.filter((l) => l.date <= date).reduce((s, l) => s + l.area, 0);
    const spent = costs.filter((c) => c.date <= date).reduce((s, c) => s + c.amount, 0);
    const future = date > today;
    points.push({
      date,
      planned: Math.round(planned * 10) / 10,
      actual: future ? null : contractedArea ? Math.round((executed / contractedArea) * 1000) / 10 : null,
      financial: future ? null : projectedCost ? Math.round((spent / projectedCost) * 1000) / 10 : null,
    });
  }
  return points;
}

export async function projectDailyLogs(projectId: string, limit = 60) {
  return db
    .select({ l: dailyLogs, areaName: projectAreas.name, author: users.name })
    .from(dailyLogs)
    .leftJoin(projectAreas, eq(projectAreas.id, dailyLogs.areaId))
    .leftJoin(users, eq(users.id, dailyLogs.createdById))
    .where(eq(dailyLogs.projectId, projectId))
    .orderBy(desc(dailyLogs.date), desc(dailyLogs.createdAt))
    .limit(limit);
}

export async function projectPhotoList(projectId: string) {
  return db
    .select({ ph: projectPhotos, areaName: projectAreas.name })
    .from(projectPhotos)
    .leftJoin(projectAreas, eq(projectAreas.id, projectPhotos.areaId))
    .where(eq(projectPhotos.projectId, projectId))
    .orderBy(asc(projectPhotos.takenAt));
}

/** Rastreabilidade: produto, lote, área, funcionário, data e quantidade (§11). */
export async function projectMaterialTrace(projectId: string) {
  const [moves, planned, wh] = await Promise.all([
    db
      .select({
        m: stockMovements,
        productName: products.name,
        unit: products.unit,
        sku: products.sku,
        batchNumber: productBatches.batchNumber,
        expiresAt: productBatches.expiresAt,
        areaName: projectAreas.name,
        employeeName: employees.name,
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .leftJoin(productBatches, eq(productBatches.id, stockMovements.batchId))
      .leftJoin(projectAreas, eq(projectAreas.id, stockMovements.areaId))
      .leftJoin(employees, eq(employees.id, stockMovements.employeeId))
      .where(eq(stockMovements.projectId, projectId))
      .orderBy(desc(stockMovements.date), desc(stockMovements.createdAt))
      .limit(300),
    db
      .select({
        productId: waterproofingApplications.productId,
        productName: products.name,
        unit: products.unit,
        areaName: projectAreas.name,
        areaId: projectAreas.id,
        planned: waterproofingApplications.plannedQuantity,
        used: waterproofingApplications.usedQuantity,
        perM2: waterproofingApplications.plannedConsumptionPerM2,
        executedArea: projectAreas.executedArea,
      })
      .from(waterproofingApplications)
      .innerJoin(projectAreas, eq(projectAreas.id, waterproofingApplications.areaId))
      .leftJoin(products, eq(products.id, waterproofingApplications.productId))
      .where(eq(projectAreas.projectId, projectId)),
    db.select().from(warehouses).where(eq(warehouses.projectId, projectId)).limit(1),
  ]);
  return { moves, planned, warehouse: wh[0] ?? null };
}

export async function projectMeasurements(projectId: string) {
  const ms = await db.select().from(measurements).where(eq(measurements.projectId, projectId)).orderBy(asc(measurements.number));
  const items = ms.length ? await db.select().from(measurementItems).where(inArray(measurementItems.measurementId, ms.map((m) => m.id))) : [];
  return ms.map((m) => ({ ...m, items: items.filter((i) => i.measurementId === m.id) }));
}

export async function projectQuality(projectId: string) {
  const [ncs, tests, cls] = await Promise.all([
    db
      .select({ nc: nonconformities, areaName: projectAreas.name, responsible: users.name, teamName: teams.name })
      .from(nonconformities)
      .leftJoin(projectAreas, eq(projectAreas.id, nonconformities.areaId))
      .leftJoin(users, eq(users.id, nonconformities.responsibleId))
      .leftJoin(teams, eq(teams.id, nonconformities.teamId))
      .where(eq(nonconformities.projectId, projectId))
      .orderBy(desc(nonconformities.detectedAt)),
    db
      .select({ t: tightnessTests, areaName: projectAreas.name, responsible: users.name })
      .from(tightnessTests)
      .leftJoin(projectAreas, eq(projectAreas.id, tightnessTests.areaId))
      .leftJoin(users, eq(users.id, tightnessTests.responsibleId))
      .where(eq(tightnessTests.projectId, projectId))
      .orderBy(desc(tightnessTests.startedAt)),
    db
      .select({ c: checklists, templateName: checklistTemplates.name, areaName: projectAreas.name, filledBy: users.name })
      .from(checklists)
      .innerJoin(checklistTemplates, eq(checklistTemplates.id, checklists.templateId))
      .leftJoin(projectAreas, eq(projectAreas.id, checklists.areaId))
      .leftJoin(users, eq(users.id, checklists.filledById))
      .where(eq(checklists.projectId, projectId))
      .orderBy(desc(checklists.createdAt)),
  ]);
  return { ncs, tests, checklists: cls };
}

export async function projectTeam(projectId: string) {
  const assignments = await db
    .select({ a: projectTeamAssignments, teamName: teams.name, teamColor: teams.color })
    .from(projectTeamAssignments)
    .innerJoin(teams, eq(teams.id, projectTeamAssignments.teamId))
    .where(eq(projectTeamAssignments.projectId, projectId));
  const teamIds = assignments.map((a) => a.a.teamId);
  const members = teamIds.length
    ? await db
        .select({ teamId: teamMembers.teamId, roleInTeam: teamMembers.roleInTeam, e: employees })
        .from(teamMembers)
        .innerJoin(employees, eq(employees.id, teamMembers.employeeId))
        .where(inArray(teamMembers.teamId, teamIds))
    : [];
  const hours = await db
    .select({
      employeeId: timeEntries.employeeId,
      name: employees.name,
      days: sql<string>`count(*) filter (where ${timeEntries.type} = 'trabalho')`,
      hours: sql<string>`coalesce(sum(${timeEntries.workedHours}), 0)`,
      overtime: sql<string>`coalesce(sum(${timeEntries.overtimeHours}), 0)`,
      cost: sql<string>`coalesce(sum(${timeEntries.laborCost}), 0)`,
      area: sql<string>`coalesce(sum(${timeEntries.executedArea}), 0)`,
    })
    .from(timeEntries)
    .innerJoin(employees, eq(employees.id, timeEntries.employeeId))
    .where(eq(timeEntries.projectId, projectId))
    .groupBy(timeEntries.employeeId, employees.name)
    .orderBy(employees.name);
  const tools = await db.select({ e: equipment, holder: employees.name }).from(equipment).leftJoin(employees, eq(employees.id, equipment.currentHolderId)).where(eq(equipment.currentProjectId, projectId));
  return { assignments, members, hours, tools };
}

export async function projectWarranty(projectId: string) {
  const [terms, ws, reqs] = await Promise.all([
    db.select().from(deliveryTerms).where(eq(deliveryTerms.projectId, projectId)).orderBy(desc(deliveryTerms.deliveredAt)),
    db
      .select({ w: warranties, areaName: projectAreas.name, systemName: waterproofingSystems.name })
      .from(warranties)
      .leftJoin(projectAreas, eq(projectAreas.id, warranties.areaId))
      .leftJoin(waterproofingSystems, eq(waterproofingSystems.id, warranties.systemId))
      .where(eq(warranties.projectId, projectId)),
    db.select().from(serviceRequests).where(eq(serviceRequests.projectId, projectId)).orderBy(desc(serviceRequests.openedAt)),
  ]);
  return { terms, warranties: ws, requests: reqs };
}

/** Linha do tempo automática (§43): eventos de várias tabelas em ordem cronológica. */
export async function projectTimeline(projectId: string) {
  const core = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const p = core[0];
  const [logs, ms, ars, ncs, photos, terms, tests, moves] = await Promise.all([
    db.select({ date: dailyLogs.date, area: dailyLogs.executedArea, activities: dailyLogs.activities }).from(dailyLogs).where(eq(dailyLogs.projectId, projectId)),
    db.select().from(measurements).where(eq(measurements.projectId, projectId)),
    db.select().from(accountsReceivable).where(and(eq(accountsReceivable.projectId, projectId), sql`${accountsReceivable.receivedAt} is not null`)),
    db.select().from(nonconformities).where(eq(nonconformities.projectId, projectId)),
    db.select({ stage: projectPhotos.stage, takenAt: projectPhotos.takenAt }).from(projectPhotos).where(eq(projectPhotos.projectId, projectId)),
    db.select().from(deliveryTerms).where(eq(deliveryTerms.projectId, projectId)),
    db.select().from(tightnessTests).where(eq(tightnessTests.projectId, projectId)),
    db.select({ date: stockMovements.date, type: stockMovements.type }).from(stockMovements).where(and(eq(stockMovements.projectId, projectId), eq(stockMovements.type, "transferencia"))),
  ]);
  type Ev = { date: string; kind: string; title: string; detail?: string; tone: "primary" | "success" | "warning" | "danger" | "muted" };
  const ev: Ev[] = [];
  if (p.contractSignedAt) ev.push({ date: p.contractSignedAt, kind: "contrato", title: "Contrato assinado", tone: "primary" });
  if (p.actualStart) ev.push({ date: p.actualStart, kind: "inicio", title: "Obra iniciada e equipe mobilizada", tone: "primary" });
  for (const d of [...new Set(moves.map((m) => m.date))]) ev.push({ date: d, kind: "material", title: "Materiais entregues na obra", tone: "muted" });
  // Diários agrupados por semana para não poluir
  const weeks = new Map<string, number>();
  for (const l of logs) {
    const wk = addDays(l.date, -((new Date(`${l.date}T12:00:00Z`).getUTCDay() + 6) % 7));
    weeks.set(wk, (weeks.get(wk) ?? 0) + l.area);
  }
  for (const [wk, area] of weeks) if (area > 0) ev.push({ date: addDays(wk, 4), kind: "execucao", title: `Semana de execução: ${area.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m² executados`, tone: "muted" });
  const photoDays = new Map<string, number>();
  for (const ph of photos) {
    const d = todayISO(ph.takenAt);
    photoDays.set(d, (photoDays.get(d) ?? 0) + 1);
  }
  for (const [d, c] of photoDays) ev.push({ date: d, kind: "fotos", title: `${c} foto(s) registradas`, tone: "muted" });
  for (const m of ms) ev.push({ date: m.periodEnd, kind: "medicao", title: `Medição ${m.number}: ${m.netValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, detail: `Status: ${m.status}`, tone: "primary" });
  for (const r of ars) ev.push({ date: r.receivedAt!, kind: "pagamento", title: `Pagamento recebido: ${r.receivedAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`, detail: r.description, tone: "success" });
  for (const n of ncs) ev.push({ date: n.detectedAt, kind: "ocorrencia", title: `Não conformidade: ${n.title}`, detail: `Gravidade ${n.severity}`, tone: n.severity === "critica" || n.severity === "alta" ? "danger" : "warning" });
  for (const t of tests) ev.push({ date: todayISO(t.startedAt), kind: "teste", title: `Teste de estanqueidade ${t.approved ? "aprovado" : "reprovado"}`, tone: t.approved ? "success" : "danger" });
  for (const t of terms) ev.push({ date: t.deliveredAt, kind: "entrega", title: "Termo de entrega assinado — garantia iniciada", tone: "success" });
  return ev.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function warehouseOptionsForProject(companyId: string, projectId: string) {
  return db
    .select({ id: warehouses.id, name: warehouses.name, type: warehouses.type, projectId: warehouses.projectId })
    .from(warehouses)
    .where(and(eq(warehouses.companyId, companyId), eq(warehouses.active, true), sql`(${warehouses.projectId} is null or ${warehouses.projectId} = ${projectId})`));
}
