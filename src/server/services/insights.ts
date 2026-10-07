import { and, eq, lt, lte, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/server/db";
import {
  accountsPayable,
  accountsReceivable,
  approvalRequests,
  employeeTrainings,
  employees,
  equipment,
  ppeDeliveries,
  projectTeamAssignments,
  dailyLogs,
  teams,
  warranties,
  projects,
} from "@/server/db/schema";
import { addDays, todayISO } from "@/domain/dates";
import { generateRuleInsights, type InsightContext, type TeamSnapshot } from "@/domain/insights";
import { loadProjectSummaries, type ProjectSummary } from "./project-summary";
import { loadCashflow } from "./finance";
import { getSetting } from "./settings";
import { stockOverview } from "./stock";

const n = (v: unknown) => Number(v ?? 0);

export const loadOperationalSnapshot = cache(async (companyId: string) => {
  const today = todayISO();
  const summaries = await loadProjectSummaries(companyId, { today });
  const relevant = summaries.filter((p) => p.statusCategory !== "cancelada");

  const [arAgg] = await db
    .select({
      overdue: sql<string>`coalesce(sum(greatest(${accountsReceivable.amount} - ${accountsReceivable.discount} + ${accountsReceivable.interest} - ${accountsReceivable.receivedAmount}, 0)) filter (where ${accountsReceivable.dueDate} < ${today}), 0)`,
      overdueCount: sql<string>`count(*) filter (where ${accountsReceivable.dueDate} < ${today} and ${accountsReceivable.amount} - ${accountsReceivable.discount} + ${accountsReceivable.interest} - ${accountsReceivable.receivedAmount} > 0)`,
      next7: sql<string>`coalesce(sum(greatest(${accountsReceivable.amount} - ${accountsReceivable.discount} + ${accountsReceivable.interest} - ${accountsReceivable.receivedAmount}, 0)) filter (where ${accountsReceivable.dueDate} between ${today} and ${addDays(today, 7)}), 0)`,
    })
    .from(accountsReceivable)
    .where(and(eq(accountsReceivable.companyId, companyId), eq(accountsReceivable.cancelled, false), eq(accountsReceivable.forecast, false)));

  const [apAgg] = await db
    .select({
      overdue: sql<string>`coalesce(sum(${accountsPayable.amount} - ${accountsPayable.paidAmount}) filter (where ${accountsPayable.dueDate} < ${today}), 0)`,
      next7: sql<string>`coalesce(sum(${accountsPayable.amount} - ${accountsPayable.paidAmount}) filter (where ${accountsPayable.dueDate} between ${today} and ${addDays(today, 7)}), 0)`,
    })
    .from(accountsPayable)
    .where(and(eq(accountsPayable.companyId, companyId), eq(accountsPayable.cancelled, false), sql`${accountsPayable.paidAmount} < ${accountsPayable.amount}`));

  const [cash, stock, minMargin] = await Promise.all([
    loadCashflow(companyId, 90),
    stockOverview(companyId),
    getSetting<number>(companyId, "finance.minMarginPct", 20),
  ]);

  const [[ppeAgg], [trAgg], [wAgg], [eqAgg], [apprAgg], teamRows] = await Promise.all([
    db
      .select({ c: sql<string>`count(*)` })
      .from(ppeDeliveries)
      .innerJoin(employees, eq(employees.id, ppeDeliveries.employeeId))
      .where(and(eq(employees.companyId, companyId), eq(employees.status, "ativo"), lte(ppeDeliveries.nextReplacementAt, addDays(today, 15)))),
    db
      .select({ c: sql<string>`count(*)` })
      .from(employeeTrainings)
      .innerJoin(employees, eq(employees.id, employeeTrainings.employeeId))
      .where(and(eq(employees.companyId, companyId), eq(employees.status, "ativo"), lte(employeeTrainings.validUntil, addDays(today, 30)))),
    db
      .select({ c: sql<string>`count(*)` })
      .from(warranties)
      .innerJoin(projects, eq(projects.id, warranties.projectId))
      .where(and(eq(projects.companyId, companyId), sql`${warranties.endsAt} between ${today} and ${addDays(today, 60)}`)),
    db
      .select({ c: sql<string>`count(*)` })
      .from(equipment)
      .where(and(eq(equipment.companyId, companyId), eq(equipment.status, "em_uso"), lt(equipment.expectedReturnAt, today))),
    db.select({ c: sql<string>`count(*)` }).from(approvalRequests).where(and(eq(approvalRequests.companyId, companyId), eq(approvalRequests.status, "pendente"))),
    teamProductivity(companyId, addDays(today, -30)),
  ]);

  const ctx: InsightContext = {
    today,
    overdueReceivables: n(arAgg.overdue),
    overdueReceivablesCount: n(arAgg.overdueCount),
    receivablesNext7: n(arAgg.next7),
    payablesNext7: n(apAgg.next7),
    overduePayables: n(apAgg.overdue),
    cashFirstNegativeDate: cash.projection.firstNegativeDate,
    cashLowestBalance: cash.projection.lowestBalance,
    projects: relevant
      .filter((p) => p.statusCategory === "ativa" || p.statusCategory === "pausada" || p.statusCategory === "pre_obra")
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        health: p.health.level,
        delayDays: p.statusCategory === "pre_obra" ? null : p.forecast.delayDays,
        projectedMargin: p.finance.projectedMargin,
        projectedProfit: p.finance.projectedProfit,
        materialOverconsumptionPct: p.materialOverconsumptionPct,
        materialBudgetAlert: p.finance.lines.some((l) => l.category === "materiais" && l.overrunAlert),
        budgetOverrunPct: null,
        openNonconformities: p.openNonconformities,
      })),
    teams: teamRows,
    lowStockProducts: stock.alerts.lowStock,
    expiringBatches: stock.alerts.expiring,
    expiredBatches: stock.alerts.expired,
    productsWithoutSheet: stock.alerts.noSheet,
    expiringPpe: n(ppeAgg?.c),
    expiringTrainings: n(trAgg?.c),
    warrantiesExpiring: n(wAgg?.c),
    overdueEquipment: n(eqAgg?.c),
    pendingApprovals: n(apprAgg?.c),
    minMarginPct: minMargin,
  };

  const insights = generateRuleInsights(ctx);
  return { today, summaries: relevant, ctx, insights, cash, stock };
});

/** m²/dia por equipe nos últimos N dias (diários das obras onde a equipe está alocada). */
export async function teamProductivity(companyId: string, since: string): Promise<Array<TeamSnapshot & { area: number; days: number; manHours: number }>> {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      area: sql<string>`coalesce(sum(${dailyLogs.executedArea}), 0)`,
      days: sql<string>`count(distinct ${dailyLogs.date}) filter (where ${dailyLogs.executedArea} > 0)`,
      hours: sql<string>`coalesce(sum(${dailyLogs.hoursWorked}), 0)`,
    })
    .from(teams)
    .leftJoin(projectTeamAssignments, eq(projectTeamAssignments.teamId, teams.id))
    .leftJoin(
      dailyLogs,
      and(
        eq(dailyLogs.projectId, projectTeamAssignments.projectId),
        sql`${dailyLogs.date} >= ${since}`,
        sql`${dailyLogs.date} >= ${projectTeamAssignments.startDate}`,
        sql`(${projectTeamAssignments.endDate} is null or ${dailyLogs.date} <= ${projectTeamAssignments.endDate})`,
      ),
    )
    .where(eq(teams.companyId, companyId))
    .groupBy(teams.id, teams.name)
    .orderBy(teams.name);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    area: n(r.area),
    days: n(r.days),
    manHours: n(r.hours),
    areaPerDay: n(r.days) > 0 ? Math.round((n(r.area) / n(r.days)) * 10) / 10 : null,
  }));
}

export async function lowStockProductIds(companyId: string) {
  const s = await stockOverview(companyId);
  return s.rows.filter((r) => r.belowMin).map((r) => r.id);
}

export type { ProjectSummary };
