/**
 * Datas de negócio trafegam como string ISO "AAAA-MM-DD" (sem fuso).
 * Todas as contas são feitas em UTC para não sofrer com horário de verão.
 */
const DAY_MS = 86_400_000;

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toISODate(new Date(parseISODate(iso).getTime() + days * DAY_MS));
}

export function addMonths(iso: string, months: number): string {
  const d = parseISODate(iso);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return toISODate(target);
}

/** Diferença em dias corridos (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / DAY_MS);
}

/** Hoje no fuso de São Paulo, em ISO. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const d = parseISODate(startOfMonth(iso));
  return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function isWeekend(iso: string): boolean {
  const wd = parseISODate(iso).getUTCDay();
  return wd === 0 || wd === 6;
}

/** Soma N dias úteis (seg–sex) a partir de uma data. */
export function addBusinessDays(iso: string, days: number): string {
  let current = iso;
  let remaining = Math.ceil(days);
  while (remaining > 0) {
    current = addDays(current, 1);
    if (!isWeekend(current)) remaining--;
  }
  return current;
}

/** Data e hora atuais em São Paulo no formato de <input type="datetime-local">. */
export function nowLocalInput(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return parts.replace(" ", "T");
}
