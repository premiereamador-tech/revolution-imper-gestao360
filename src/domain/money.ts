/**
 * Aritmética monetária segura: trabalhamos em centavos inteiros para evitar
 * erros de ponto flutuante e devolvemos reais com 2 casas.
 */
export const toCents = (v: number | null | undefined): number => Math.round((v ?? 0) * 100);
export const fromCents = (c: number): number => Math.round(c) / 100;

export function round2(v: number): number {
  return fromCents(toCents(v));
}

export function sumMoney(values: Array<number | null | undefined>): number {
  return fromCents(values.reduce<number>((acc, v) => acc + toCents(v), 0));
}

export function subMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

/** Percentual (0-100) com 2 casas; retorna null quando o divisor é zero. */
export function percent(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 10000) / 100;
}

/** Divide um total em N parcelas, ajustando os centavos na última. */
export function splitInstallments(total: number, n: number): number[] {
  if (n <= 0) throw new Error("Número de parcelas deve ser maior que zero");
  const cents = toCents(total);
  const base = Math.floor(cents / n);
  const result = Array.from({ length: n }, () => base);
  result[n - 1] += cents - base * n;
  return result.map(fromCents);
}
