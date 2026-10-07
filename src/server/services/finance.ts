import { and, between, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  accountsPayable,
  accountsReceivable,
  bankAccounts,
  cashTransactions,
  financialCategories,
  projectCostEntries,
  projects,
} from "@/server/db/schema";
import { projectCashflow, type CashItem } from "@/domain/cashflow";
import { todayISO } from "@/domain/dates";
import { buildDre } from "@/domain/dre";
import { round2 } from "@/domain/money";
import type { CostCategory } from "@/domain/project-finance";
import { getSetting } from "./settings";

const n = (v: unknown) => Number(v ?? 0);

export async function bankBalances(companyId: string, until = todayISO()) {
  const rows = await db
    .select({
      id: bankAccounts.id,
      name: bankAccounts.name,
      bank: bankAccounts.bank,
      opening: bankAccounts.openingBalance,
      inflow: sql<string>`coalesce((select sum(amount) from ${cashTransactions} ct where ct.bank_account_id = "bank_accounts"."id" and ct.direction = 'in' and ct.date <= ${until}), 0)`,
      outflow: sql<string>`coalesce((select sum(amount) from ${cashTransactions} ct where ct.bank_account_id = "bank_accounts"."id" and ct.direction = 'out' and ct.date <= ${until}), 0)`,
    })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.active, true)));
  const accounts = rows.map((r) => ({ id: r.id, name: r.name, bank: r.bank, balance: round2(n(r.opening) + n(r.inflow) - n(r.outflow)) }));
  return { accounts, total: round2(accounts.reduce((s, a) => s + a.balance, 0)) };
}

/** Itens em aberto que entram na projeção de caixa (AR inclui previsões de medição). */
export async function openCashItems(companyId: string): Promise<Array<CashItem & { kind: "ar" | "ap"; forecast: boolean }>> {
  const ar = await db
    .select({
      date: accountsReceivable.dueDate,
      open: sql<string>`greatest(${accountsReceivable.amount} - ${accountsReceivable.discount} + ${accountsReceivable.interest} - ${accountsReceivable.receivedAmount}, 0)`,
      forecast: accountsReceivable.forecast,
    })
    .from(accountsReceivable)
    .where(and(eq(accountsReceivable.companyId, companyId), eq(accountsReceivable.cancelled, false), sql`${accountsReceivable.amount} - ${accountsReceivable.discount} + ${accountsReceivable.interest} - ${accountsReceivable.receivedAmount} > 0`));
  const ap = await db
    .select({ date: accountsPayable.dueDate, open: sql<string>`${accountsPayable.amount} - ${accountsPayable.paidAmount}` })
    .from(accountsPayable)
    .where(and(eq(accountsPayable.companyId, companyId), eq(accountsPayable.cancelled, false), sql`${accountsPayable.paidAmount} < ${accountsPayable.amount}`));
  return [
    ...ar.map((r) => ({ date: r.date, amount: n(r.open), direction: "in" as const, kind: "ar" as const, forecast: r.forecast })),
    ...ap.map((r) => ({ date: r.date, amount: n(r.open), direction: "out" as const, kind: "ap" as const, forecast: false })),
  ];
}

export async function loadCashflow(companyId: string, horizonDays: number) {
  const today = todayISO();
  const [balances, items] = await Promise.all([bankBalances(companyId, today), openCashItems(companyId)]);
  const projection = projectCashflow(balances.total, items, today, horizonDays);
  return { today, balances, items, projection };
}

export interface PeriodFilter {
  from: string;
  to: string;
  projectId?: string;
  clientId?: string;
}

/**
 * DRE gerencial por competência.
 * - Receita: títulos a receber (não previstos) com vencimento no período.
 * - Deduções: alíquota de impostos sobre faturamento (Configurações › finance.taxRatePct).
 * - Custos diretos: razão de custos das obras (consumo, ponto, terceiros…).
 *   Compras para estoque e folha de campo NÃO entram de novo: já foram apropriadas às obras.
 * - Despesas administrativas e financeiras: contas a pagar sem obra no período.
 */
export async function loadDre(companyId: string, f: PeriodFilter) {
  const taxRate = await getSetting<number>(companyId, "finance.taxRatePct", 6);
  const projectFilterAr = f.projectId ? eq(accountsReceivable.projectId, f.projectId) : undefined;
  const clientFilterAr = f.clientId ? eq(accountsReceivable.clientId, f.clientId) : undefined;
  const [rev] = await db
    .select({ total: sql<string>`coalesce(sum(${accountsReceivable.amount} - ${accountsReceivable.discount}), 0)` })
    .from(accountsReceivable)
    .where(and(eq(accountsReceivable.companyId, companyId), eq(accountsReceivable.cancelled, false), eq(accountsReceivable.forecast, false), between(accountsReceivable.dueDate, f.from, f.to), projectFilterAr, clientFilterAr));

  const costRows = await db
    .select({ category: projectCostEntries.category, total: sql<string>`sum(${projectCostEntries.amount})` })
    .from(projectCostEntries)
    .innerJoin(projects, eq(projects.id, projectCostEntries.projectId))
    .where(and(eq(projects.companyId, companyId), between(projectCostEntries.date, f.from, f.to), f.projectId ? eq(projects.id, f.projectId) : undefined, f.clientId ? eq(projects.clientId, f.clientId) : undefined))
    .groupBy(projectCostEntries.category);
  const direct: Partial<Record<CostCategory, number>> = {};
  for (const r of costRows) direct[r.category] = n(r.total);

  let admin = 0;
  let financial = 0;
  if (!f.projectId && !f.clientId) {
    const exp = await db
      .select({ group: financialCategories.dreGroup, total: sql<string>`sum(${accountsPayable.amount})` })
      .from(accountsPayable)
      .innerJoin(financialCategories, eq(financialCategories.id, accountsPayable.categoryId))
      .where(and(eq(accountsPayable.companyId, companyId), eq(accountsPayable.cancelled, false), isNull(accountsPayable.projectId), between(accountsPayable.competenceDate, f.from, f.to)))
      .groupBy(financialCategories.dreGroup);
    for (const e of exp) {
      if (e.group === "despesa_administrativa") admin += n(e.total);
      if (e.group === "despesa_financeira") financial -= n(e.total);
    }
  }
  const grossRevenue = n(rev.total);
  const deductions = round2((grossRevenue * taxRate) / 100) + (direct.impostos ?? 0);
  return { taxRate, ...buildDre({ grossRevenue, deductions, directCosts: direct, administrativeExpenses: round2(admin), financialResult: round2(financial) }) };
}

/** Totais do mês para o dashboard executivo. */
export async function monthTotals(companyId: string, from: string, to: string) {
  const [inv] = await db
    .select({ total: sql<string>`coalesce(sum(${accountsReceivable.amount} - ${accountsReceivable.discount}), 0)` })
    .from(accountsReceivable)
    .where(and(eq(accountsReceivable.companyId, companyId), eq(accountsReceivable.cancelled, false), eq(accountsReceivable.forecast, false), between(accountsReceivable.dueDate, from, to)));
  const [cash] = await db
    .select({
      inflow: sql<string>`coalesce(sum(${cashTransactions.amount}) filter (where ${cashTransactions.direction} = 'in'), 0)`,
      outflow: sql<string>`coalesce(sum(${cashTransactions.amount}) filter (where ${cashTransactions.direction} = 'out'), 0)`,
    })
    .from(cashTransactions)
    .where(and(eq(cashTransactions.companyId, companyId), between(cashTransactions.date, from, to)));
  const [exp] = await db
    .select({ total: sql<string>`coalesce(sum(${accountsPayable.amount}), 0)` })
    .from(accountsPayable)
    .where(and(eq(accountsPayable.companyId, companyId), eq(accountsPayable.cancelled, false), between(accountsPayable.competenceDate, from, to)));
  const [openAr] = await db
    .select({ total: sql<string>`coalesce(sum(greatest(${accountsReceivable.amount} - ${accountsReceivable.discount} + ${accountsReceivable.interest} - ${accountsReceivable.receivedAmount}, 0)), 0)` })
    .from(accountsReceivable)
    .where(and(eq(accountsReceivable.companyId, companyId), eq(accountsReceivable.cancelled, false), eq(accountsReceivable.forecast, false)));
  const [openAp] = await db
    .select({ total: sql<string>`coalesce(sum(${accountsPayable.amount} - ${accountsPayable.paidAmount}), 0)` })
    .from(accountsPayable)
    .where(and(eq(accountsPayable.companyId, companyId), eq(accountsPayable.cancelled, false)));
  const costRows = await db
    .select({ category: projectCostEntries.category, total: sql<string>`sum(${projectCostEntries.amount})` })
    .from(projectCostEntries)
    .innerJoin(projects, eq(projects.id, projectCostEntries.projectId))
    .where(and(eq(projects.companyId, companyId), between(projectCostEntries.date, from, to)))
    .groupBy(projectCostEntries.category);
  const costs: Partial<Record<CostCategory, number>> = {};
  for (const r of costRows) costs[r.category] = n(r.total);

  return {
    invoiced: n(inv.total),
    received: n(cash.inflow),
    paid: n(cash.outflow),
    expenses: n(exp.total),
    openReceivables: n(openAr.total),
    openPayables: n(openAp.total),
    costs,
  };
}

/** Faturamento × recebimento × despesas dos últimos 6 meses (gráfico). */
export async function monthlySeries(companyId: string, months = 6) {
  const rows = await db.execute<{ month: string; invoiced: string; received: string; paid: string }>(sql`
    with m as (
      select to_char(d, 'YYYY-MM') as month
      from generate_series(date_trunc('month', current_date) - (${months - 1} || ' months')::interval, date_trunc('month', current_date), '1 month') d
    )
    select m.month,
      coalesce((select sum(amount - discount) from ${accountsReceivable} ar where ar.company_id = ${companyId} and not ar.cancelled and not ar.forecast and to_char(ar.due_date, 'YYYY-MM') = m.month), 0) as invoiced,
      coalesce((select sum(amount) from ${cashTransactions} ct where ct.company_id = ${companyId} and ct.direction = 'in' and to_char(ct.date, 'YYYY-MM') = m.month), 0) as received,
      coalesce((select sum(amount) from ${cashTransactions} ct where ct.company_id = ${companyId} and ct.direction = 'out' and to_char(ct.date, 'YYYY-MM') = m.month), 0) as paid
    from m order by m.month`);
  return rows.rows.map((r) => ({ month: r.month, invoiced: n(r.invoiced), received: n(r.received), paid: n(r.paid) }));
}
