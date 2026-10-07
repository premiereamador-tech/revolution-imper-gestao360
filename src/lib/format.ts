const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export const money = (v: number | null | undefined) => brl.format(v ?? 0);
export const money0 = (v: number | null | undefined) => brl0.format(v ?? 0);

/** R$ 1,2 mi / R$ 350 mil — para cartões de resumo. */
export function moneyShort(v: number | null | undefined) {
  const x = v ?? 0;
  const abs = Math.abs(x);
  if (abs >= 1_000_000) return `${x < 0 ? "−" : ""}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (abs >= 10_000) return `${x < 0 ? "−" : ""}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return brl0.format(x);
}

export const number = (v: number | null | undefined, digits = 2) =>
  (v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: digits });

export const area = (v: number | null | undefined) => `${num.format(v ?? 0)} m²`;

export const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;

/** "2026-10-07" → "07/10/2026" */
export function date(iso: string | Date | null | undefined) {
  if (!iso) return "—";
  if (iso instanceof Date) return iso.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function dateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function time(d: Date | string | null | undefined) {
  if (!d) return "—";
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

export function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-Z]/.test(p))
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
}
