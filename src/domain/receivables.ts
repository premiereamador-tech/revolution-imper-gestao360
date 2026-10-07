import { round2, subMoney, sumMoney } from "./money";

export type ReceivableStatus = "previsto" | "a_vencer" | "vencido" | "parcial" | "recebido" | "cancelado";

export interface ReceivableLike {
  dueDate: string;
  amount: number;
  discount: number;
  interest: number;
  receivedAmount: number;
  forecast: boolean;
  cancelled: boolean;
}

export function netDue(r: Pick<ReceivableLike, "amount" | "discount" | "interest">): number {
  return round2(r.amount - r.discount + r.interest);
}

export function openBalance(r: ReceivableLike): number {
  if (r.cancelled) return 0;
  return Math.max(subMoney(netDue(r), r.receivedAmount), 0);
}

/** Status derivado — nunca gravado manualmente, para não ficar desatualizado (§29). */
export function receivableStatus(r: ReceivableLike, today: string): ReceivableStatus {
  if (r.cancelled) return "cancelado";
  const balance = openBalance(r);
  if (balance === 0 && r.receivedAmount > 0) return "recebido";
  if (r.receivedAmount > 0) return r.dueDate < today ? "vencido" : "parcial";
  if (r.forecast) return "previsto";
  return r.dueDate < today ? "vencido" : "a_vencer";
}

export class PaymentError extends Error {}

/** Aplica uma baixa (parcial ou total). Retorna novo valor recebido. */
export function applyPayment(r: ReceivableLike, paid: number): { receivedAmount: number; fullyPaid: boolean } {
  if (r.cancelled) throw new PaymentError("Título cancelado.");
  if (!(paid > 0)) throw new PaymentError("Valor do pagamento deve ser maior que zero.");
  const balance = openBalance(r);
  if (paid - balance > 0.004) throw new PaymentError(`Valor excede o saldo em aberto (R$ ${balance.toFixed(2)}).`);
  const receivedAmount = sumMoney([r.receivedAmount, paid]);
  return { receivedAmount, fullyPaid: subMoney(netDue(r), receivedAmount) <= 0 };
}

/** Inadimplência: % do valor vencido sobre o total que já deveria ter sido recebido. */
export function delinquencyRate(items: ReceivableLike[], today: string): number | null {
  const due = items.filter((r) => !r.cancelled && !r.forecast && r.dueDate < today);
  const totalDue = sumMoney(due.map(netDue));
  if (!totalDue) return null;
  const overdue = sumMoney(due.map(openBalance));
  return Math.round((overdue / totalDue) * 10000) / 100;
}
