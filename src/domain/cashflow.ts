import { addDays, diffDays } from "./dates";
import { fromCents, toCents } from "./money";

export interface CashItem {
  date: string;
  amount: number;
  direction: "in" | "out";
}

export interface CashflowDay {
  date: string;
  inflow: number;
  outflow: number;
  balance: number;
}

export interface CashflowProjection {
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  days: CashflowDay[];
  firstNegativeDate: string | null;
  lowestBalance: number;
  lowestBalanceDate: string;
}

/**
 * Projeção de caixa (§34): saldo inicial + entradas previstas − saídas previstas,
 * dia a dia. Itens vencidos e ainda em aberto entram no primeiro dia (hoje),
 * pois representam valores que podem ser realizados/cobrados a qualquer momento.
 */
export function projectCashflow(openingBalance: number, items: CashItem[], from: string, horizonDays: number): CashflowProjection {
  const end = addDays(from, horizonDays);
  const buckets = new Map<string, { in: number; out: number }>();
  for (const it of items) {
    if (it.date > end) continue;
    const key = it.date < from ? from : it.date;
    const b = buckets.get(key) ?? { in: 0, out: 0 };
    if (it.direction === "in") b.in += toCents(it.amount);
    else b.out += toCents(it.amount);
    buckets.set(key, b);
  }

  let balance = toCents(openingBalance);
  let totalIn = 0;
  let totalOut = 0;
  let firstNegativeDate: string | null = null;
  let lowest = Number.POSITIVE_INFINITY;
  let lowestDate = from;
  const days: CashflowDay[] = [];
  const total = diffDays(from, end);
  for (let i = 0; i <= total; i++) {
    const date = addDays(from, i);
    const b = buckets.get(date) ?? { in: 0, out: 0 };
    balance += b.in - b.out;
    totalIn += b.in;
    totalOut += b.out;
    if (balance < 0 && !firstNegativeDate) firstNegativeDate = date;
    if (balance < lowest) {
      lowest = balance;
      lowestDate = date;
    }
    days.push({ date, inflow: fromCents(b.in), outflow: fromCents(b.out), balance: fromCents(balance) });
  }

  return {
    openingBalance,
    totalIn: fromCents(totalIn),
    totalOut: fromCents(totalOut),
    closingBalance: fromCents(balance),
    days,
    firstNegativeDate,
    lowestBalance: fromCents(lowest),
    lowestBalanceDate: lowestDate,
  };
}

export const CASHFLOW_HORIZONS = [
  { key: "hoje", label: "Hoje", days: 0 },
  { key: "7", label: "7 dias", days: 7 },
  { key: "15", label: "15 dias", days: 15 },
  { key: "30", label: "30 dias", days: 30 },
  { key: "60", label: "60 dias", days: 60 },
  { key: "90", label: "90 dias", days: 90 },
  { key: "180", label: "6 meses", days: 182 },
  { key: "365", label: "12 meses", days: 365 },
] as const;
