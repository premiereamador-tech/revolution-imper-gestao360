import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  accountsReceivable,
  clients,
  contractAdditions,
  dailyLogs,
  nonconformities,
  projectAreas,
  projectBudgets,
  projectCostEntries,
  projects,
  projectStatuses,
  projectTasks,
  waterproofingApplications,
} from "@/server/db/schema";
import { addDays, diffDays, todayISO } from "@/domain/dates";
import { forecastCompletion, type CompletionForecast } from "@/domain/forecast";
import { computeHealth, DEFAULT_HEALTH_THRESHOLDS, type HealthResult, type HealthThresholds } from "@/domain/health";
import { computeProjectFinance, type ByCategory, type CostCategory, type ProjectFinanceResult } from "@/domain/project-finance";
import { getSetting } from "./settings";

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  clientId: string;
  clientName: string;
  city: string | null;
  state: string | null;
  statusKey: string;
  statusLabel: string;
  statusColor: string;
  statusCategory: "pre_obra" | "ativa" | "pausada" | "concluida" | "garantia" | "cancelada";
  plannedStart: string | null;
  plannedEnd: string | null;
  adjustedPlannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  contractValue: number;
  approvedAdditions: number;
  contractedArea: number;
  executedArea: number;
  physicalProgress: number;
  workedDays: number;
  daysRemaining: number | null;
  dailyTargetArea: number | null;
  recentDailyArea: number | null;
  materialOverconsumptionPct: number | null;
  overdueReceivables: number;
  openNonconformities: number;
  criticalNonconformities: number;
  finance: ProjectFinanceResult;
  forecast: CompletionForecast;
  health: HealthResult;
}

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/**
 * Consolida, em poucas consultas agregadas, tudo o que define a situação de
 * cada obra: financeiro, avanço, previsão e semáforo. Usado por dashboards,
 * listagem, tela da obra e Insights.
 */
export async function loadProjectSummaries(
  companyId: string,
  opts: { projectIds?: string[]; today?: string } = {},
): Promise<ProjectSummary[]> {
  const today = opts.today ?? todayISO();
  const filter = opts.projectIds?.length
    ? and(eq(projects.companyId, companyId), inArray(projects.id, opts.projectIds))
    : eq(projects.companyId, companyId);

  const base = await db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      clientId: projects.clientId,
      clientName: clients.name,
      city: projects.city,
      state: projects.state,
      contractId: projects.contractId,
      statusKey: projectStatuses.key,
      statusLabel: projectStatuses.label,
      statusColor: projectStatuses.color,
      statusCategory: projectStatuses.category,
      plannedStart: projects.plannedStart,
      plannedEnd: projects.plannedEnd,
      actualStart: projects.actualStart,
      actualEnd: projects.actualEnd,
      contractValue: projects.contractValue,
      contractedArea: projects.contractedArea,
      dailyTargetArea: projects.dailyTargetArea,
    })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .innerJoin(projectStatuses, eq(projectStatuses.id, projects.statusId))
    .where(filter)
    .orderBy(projects.code);

  if (base.length === 0) return [];
  const ids = base.map((p) => p.id);
  const contractIds = base.map((p) => p.contractId).filter((x): x is string => !!x);

  const [budgets, costs, areas, additions, receivables, logs, recentLogs, ncs, material, tasks, thresholds] =
    await Promise.all([
      db
        .select({ projectId: projectBudgets.projectId, category: projectBudgets.category, total: sql<string>`sum(${projectBudgets.amount})` })
        .from(projectBudgets)
        .where(inArray(projectBudgets.projectId, ids))
        .groupBy(projectBudgets.projectId, projectBudgets.category),
      db
        .select({ projectId: projectCostEntries.projectId, category: projectCostEntries.category, total: sql<string>`sum(${projectCostEntries.amount})` })
        .from(projectCostEntries)
        .where(inArray(projectCostEntries.projectId, ids))
        .groupBy(projectCostEntries.projectId, projectCostEntries.category),
      db
        .select({ projectId: projectAreas.projectId, executed: sql<string>`sum(${projectAreas.executedArea})`, contracted: sql<string>`sum(${projectAreas.contractedArea})` })
        .from(projectAreas)
        .where(inArray(projectAreas.projectId, ids))
        .groupBy(projectAreas.projectId),
      contractIds.length
        ? db
            .select({ contractId: contractAdditions.contractId, value: sql<string>`sum(${contractAdditions.value})`, days: sql<string>`sum(${contractAdditions.extraDays})` })
            .from(contractAdditions)
            .where(and(inArray(contractAdditions.contractId, contractIds), eq(contractAdditions.status, "aprovado")))
            .groupBy(contractAdditions.contractId)
        : Promise.resolve([]),
      db
        .select({
          projectId: accountsReceivable.projectId,
          invoiced: sql<string>`coalesce(sum(${accountsReceivable.amount} - ${accountsReceivable.discount} + ${accountsReceivable.interest}) filter (where not ${accountsReceivable.forecast}), 0)`,
          received: sql<string>`coalesce(sum(${accountsReceivable.receivedAmount}), 0)`,
          overdue: sql<string>`coalesce(sum(greatest(${accountsReceivable.amount} - ${accountsReceivable.discount} + ${accountsReceivable.interest} - ${accountsReceivable.receivedAmount}, 0)) filter (where not ${accountsReceivable.forecast} and ${accountsReceivable.dueDate} < ${today}), 0)`,
        })
        .from(accountsReceivable)
        .where(and(inArray(accountsReceivable.projectId, ids), eq(accountsReceivable.cancelled, false)))
        .groupBy(accountsReceivable.projectId),
      db
        .select({ projectId: dailyLogs.projectId, days: sql<string>`count(distinct ${dailyLogs.date}) filter (where ${dailyLogs.executedArea} > 0)` })
        .from(dailyLogs)
        .where(inArray(dailyLogs.projectId, ids))
        .groupBy(dailyLogs.projectId),
      db
        .select({ projectId: dailyLogs.projectId, avg: sql<string>`avg(${dailyLogs.executedArea})` })
        .from(dailyLogs)
        .where(and(inArray(dailyLogs.projectId, ids), sql`${dailyLogs.date} >= ${addDays(today, -14)}`, sql`${dailyLogs.executedArea} > 0`))
        .groupBy(dailyLogs.projectId),
      db
        .select({
          projectId: nonconformities.projectId,
          open: sql<string>`count(*) filter (where ${nonconformities.status} in ('aberta','em_tratamento'))`,
          critical: sql<string>`count(*) filter (where ${nonconformities.status} in ('aberta','em_tratamento') and ${nonconformities.severity} = 'critica')`,
        })
        .from(nonconformities)
        .where(inArray(nonconformities.projectId, ids))
        .groupBy(nonconformities.projectId),
      db
        .select({
          projectId: projectAreas.projectId,
          planned: sql<string>`sum(${waterproofingApplications.plannedConsumptionPerM2} * ${projectAreas.executedArea})`,
          used: sql<string>`sum(${waterproofingApplications.usedQuantity})`,
        })
        .from(waterproofingApplications)
        .innerJoin(projectAreas, eq(projectAreas.id, waterproofingApplications.areaId))
        .where(
          and(
            inArray(projectAreas.projectId, ids),
            sql`${projectAreas.executedArea} > 0`,
            sql`${waterproofingApplications.plannedConsumptionPerM2} is not null`,
            sql`${waterproofingApplications.usedQuantity} is not null`,
          ),
        )
        .groupBy(projectAreas.projectId),
      db
        .select({ projectId: projectTasks.projectId, avg: sql<string>`avg(${projectTasks.progress})` })
        .from(projectTasks)
        .where(inArray(projectTasks.projectId, ids))
        .groupBy(projectTasks.projectId),
      getSetting<HealthThresholds>(companyId, "health.thresholds", DEFAULT_HEALTH_THRESHOLDS),
    ]);

  const group = (rows: { projectId: string; category: CostCategory; total: string }[]) => {
    const m = new Map<string, ByCategory>();
    for (const r of rows) {
      const cur = m.get(r.projectId) ?? {};
      cur[r.category] = n(r.total);
      m.set(r.projectId, cur);
    }
    return m;
  };
  const budgetMap = group(budgets);
  const costMap = group(costs);
  const index = <T extends { projectId: string | null }>(rows: T[]) => new Map(rows.map((r) => [r.projectId as string, r]));
  const areaMap = index(areas);
  const arMap = index(receivables);
  const logMap = index(logs);
  const recentMap = index(recentLogs);
  const ncMap = index(ncs);
  const matMap = index(material);
  const taskMap = index(tasks);
  const addMap = new Map(additions.map((a) => [a.contractId, a]));

  const t = { ...DEFAULT_HEALTH_THRESHOLDS, ...thresholds };

  return base.map((p) => {
    const area = areaMap.get(p.id);
    const contractedArea = n(p.contractedArea) || n(area?.contracted);
    const executedArea = n(area?.executed);
    const isDone = p.statusCategory === "concluida" || p.statusCategory === "garantia";
    const physicalProgress = isDone
      ? 1
      : contractedArea > 0
        ? Math.min(executedArea / contractedArea, 1)
        : n(taskMap.get(p.id)?.avg) / 100;

    const add = p.contractId ? addMap.get(p.contractId) : undefined;
    const approvedAdditions = n(add?.value);
    const adjustedPlannedEnd = p.plannedEnd ? addDays(p.plannedEnd, n(add?.days)) : null;
    const ar = arMap.get(p.id);
    const finance = computeProjectFinance({
      contractValue: n(p.contractValue),
      approvedAdditions,
      budget: budgetMap.get(p.id) ?? {},
      incurred: costMap.get(p.id) ?? {},
      physicalProgress,
      invoiced: n(ar?.invoiced),
      received: n(ar?.received),
    });

    const workedDays = n(logMap.get(p.id)?.days);
    const recentDailyArea = recentMap.get(p.id) ? n(recentMap.get(p.id)?.avg) : null;
    const isActive = p.statusCategory === "ativa" || p.statusCategory === "pausada";
    const forecast = isDone
      ? { remainingArea: 0, dailyRate: null, remainingWorkDays: 0, forecastEnd: p.actualEnd, delayDays: p.actualEnd && adjustedPlannedEnd ? diffDays(adjustedPlannedEnd, p.actualEnd) : null, basis: "concluida" as const }
      : forecastCompletion({
          contractedArea,
          executedArea,
          workedDays,
          avgDailyArea: recentDailyArea,
          plannedDailyArea: n(p.dailyTargetArea) || null,
          today: isActive ? today : (p.plannedStart && p.plannedStart > today ? p.plannedStart : today),
          contractualEnd: adjustedPlannedEnd,
        });

    const mat = matMap.get(p.id);
    const materialOverconsumptionPct = mat && n(mat.planned) > 0 ? Math.round(((n(mat.used) / n(mat.planned)) - 1) * 1000) / 10 : null;
    const nc = ncMap.get(p.id);
    const overdue = n(ar?.overdue);
    const budgetOverrunPct = finance.budgetCost > 0 ? Math.round(((finance.projectedCost / finance.budgetCost) - 1) * 1000) / 10 : null;

    const health = computeHealth(
      {
        projectedDelayDays: isActive ? Math.max(forecast.delayDays ?? 0, 0) : 0,
        budgetOverrunPct,
        overdueReceivables: overdue,
        materialOverconsumptionPct,
        productivityRatio: isActive && recentDailyArea && n(p.dailyTargetArea) ? recentDailyArea / n(p.dailyTargetArea) : null,
        openNonconformities: n(nc?.open),
        criticalNonconformities: n(nc?.critical),
        projectedMarginPct: finance.projectedMargin,
        isLosingMoney: finance.isLosingMoney,
      },
      t,
    );

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      clientId: p.clientId,
      clientName: p.clientName,
      city: p.city,
      state: p.state,
      statusKey: p.statusKey,
      statusLabel: p.statusLabel,
      statusColor: p.statusColor,
      statusCategory: p.statusCategory,
      plannedStart: p.plannedStart,
      plannedEnd: p.plannedEnd,
      adjustedPlannedEnd,
      actualStart: p.actualStart,
      actualEnd: p.actualEnd,
      contractValue: n(p.contractValue),
      approvedAdditions,
      contractedArea,
      executedArea,
      physicalProgress,
      workedDays,
      daysRemaining: adjustedPlannedEnd && !isDone ? diffDays(today, adjustedPlannedEnd) : null,
      dailyTargetArea: p.dailyTargetArea === null ? null : n(p.dailyTargetArea),
      recentDailyArea,
      materialOverconsumptionPct,
      overdueReceivables: overdue,
      openNonconformities: n(nc?.open),
      criticalNonconformities: n(nc?.critical),
      finance,
      forecast,
      health,
    };
  });
}

export async function loadProjectSummary(companyId: string, projectId: string) {
  const [s] = await loadProjectSummaries(companyId, { projectIds: [projectId] });
  return s ?? null;
}
