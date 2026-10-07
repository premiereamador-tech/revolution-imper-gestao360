import { and, between, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { accountsPayable, contracts, employees, leads, quotes } from "@/server/db/schema";
import { endOfMonth, startOfMonth } from "@/domain/dates";
import { sumMoney } from "@/domain/money";
import { loadDre, monthTotals, monthlySeries } from "./finance";
import { loadOperationalSnapshot } from "./insights";

const n = (v: unknown) => Number(v ?? 0);

export async function loadExecutiveDashboard(companyId: string) {
  const snap = await loadOperationalSnapshot(companyId);
  const { today, summaries, cash, stock } = snap;
  const from = startOfMonth(today);
  const to = endOfMonth(today);

  const [totals, dre, series, [emp], [newContracts], [sold], [suppliersCost], [leadAgg]] = await Promise.all([
    monthTotals(companyId, from, to),
    loadDre(companyId, { from, to }),
    monthlySeries(companyId, 6),
    db.select({ c: sql<string>`count(*)` }).from(employees).where(and(eq(employees.companyId, companyId), eq(employees.status, "ativo"))),
    db
      .select({ c: sql<string>`count(*)`, v: sql<string>`coalesce(sum(${contracts.value}), 0)` })
      .from(contracts)
      .where(and(eq(contracts.companyId, companyId), sql`${contracts.status} <> 'cancelado'`, sql`coalesce(${contracts.signedAt}, ${contracts.createdAt}::date) between ${from} and ${to}`)),
    db
      .select({ v: sql<string>`coalesce(sum(${contracts.value}), 0)` })
      .from(contracts)
      .where(and(eq(contracts.companyId, companyId), sql`${contracts.status} <> 'cancelado'`)),
    db
      .select({ v: sql<string>`coalesce(sum(${accountsPayable.amount}), 0)` })
      .from(accountsPayable)
      .where(and(eq(accountsPayable.companyId, companyId), eq(accountsPayable.cancelled, false), sql`${accountsPayable.supplierId} is not null`, between(accountsPayable.competenceDate, from, to))),
    db
      .select({
        total: sql<string>`count(*)`,
        won: sql<string>`count(*) filter (where ${leads.stage} = 'fechado')`,
        lost: sql<string>`count(*) filter (where ${leads.stage} = 'perdido')`,
      })
      .from(leads)
      .where(eq(leads.companyId, companyId)),
  ]);
  const [pendingQuotes] = await db
    .select({ c: sql<string>`count(*)` })
    .from(quotes)
    .where(and(eq(quotes.companyId, companyId), eq(quotes.status, "enviado")));

  const active = summaries.filter((p) => p.statusCategory === "ativa" || p.statusCategory === "pausada");
  const late = active.filter((p) => (p.forecast.delayDays ?? 0) > 0);
  const concludedThisMonth = summaries.filter((p) => p.actualEnd && p.actualEnd >= from && p.actualEnd <= to);
  const contracted = summaries.filter((p) => p.statusCategory !== "cancelada");
  const margins = active.map((p) => p.finance.projectedMargin).filter((m): m is number => m !== null);
  const directCosts = sumMoney(Object.values(totals.costs));
  const grossProfit = totals.invoiced - directCosts;

  const proj30 = cash.projection.days[Math.min(30, cash.projection.days.length - 1)];
  const decided = n(leadAgg.won) + n(leadAgg.lost);

  return {
    snap,
    today,
    totals,
    dre,
    series,
    cash: {
      balance: cash.balances.total,
      projected30: proj30?.balance ?? cash.projection.closingBalance,
    },
    kpi: {
      overdueReceivables: snap.ctx.overdueReceivables,
      grossProfit,
      netProfit: dre.netProfit,
      averageMargin: margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null,
      ticket: contracted.length ? sumMoney(contracted.map((p) => p.finance.revenue)) / contracted.length : 0,
      activeProjects: active.length,
      lateProjects: late.length,
      concludedThisMonth: concludedThisMonth.length,
      newContracts: n(newContracts.c),
      newContractsValue: n(newContracts.v),
      soldValue: n(sold.v),
      contractedValue: sumMoney(contracted.map((p) => p.finance.revenue)),
      executedValue: sumMoney(contracted.map((p) => p.finance.earnedRevenue)),
      receivedValue: sumMoney(contracted.map((p) => p.finance.received)),
      toReceiveValue: sumMoney(contracted.map((p) => p.finance.revenue - p.finance.received)),
      activeEmployees: n(emp.c),
      laborCost: totals.costs.mao_de_obra ?? 0,
      suppliersCost: n(suppliersCost.v),
      materialsCost: totals.costs.materiais ?? 0,
      stockValue: stock.totalValue,
      conversion: decided ? (n(leadAgg.won) / decided) * 100 : null,
      pendingQuotes: n(pendingQuotes.c),
    },
  };
}
