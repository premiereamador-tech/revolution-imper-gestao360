import { round2, sumMoney } from "./money";

export interface MeasurementItemInput {
  service: string;
  contractedQuantity: number;
  previousQuantity: number;
  currentQuantity: number;
  unitPrice: number;
}

export interface MeasurementItemResult extends MeasurementItemInput {
  accumulatedQuantity: number;
  accumulatedPct: number;
  value: number;
}

export class MeasurementError extends Error {}

/** Calcula um item de medição e impede medir acima do contratado (§27). */
export function computeMeasurementItem(item: MeasurementItemInput): MeasurementItemResult {
  if (item.currentQuantity < 0) throw new MeasurementError(`Quantidade negativa em "${item.service}".`);
  const accumulated = Math.round((item.previousQuantity + item.currentQuantity) * 1000) / 1000;
  if (accumulated - item.contractedQuantity > 1e-6) {
    throw new MeasurementError(
      `"${item.service}": acumulado (${accumulated}) ultrapassa o contratado (${item.contractedQuantity}). Registre um aditivo.`,
    );
  }
  return {
    ...item,
    accumulatedQuantity: accumulated,
    accumulatedPct: item.contractedQuantity ? Math.round((accumulated / item.contractedQuantity) * 10000) / 100 : 0,
    value: round2(item.currentQuantity * item.unitPrice),
  };
}

export function computeMeasurement(items: MeasurementItemInput[], retentionRatePct: number) {
  const computed = items.map(computeMeasurementItem);
  const grossValue = sumMoney(computed.map((i) => i.value));
  const retentionValue = round2((grossValue * retentionRatePct) / 100);
  return { items: computed, grossValue, retentionValue, netValue: round2(grossValue - retentionValue) };
}

export const MEASUREMENT_FLOW = ["prevista", "executada", "aprovada", "faturada", "recebida"] as const;
export type MeasurementStatus = (typeof MEASUREMENT_FLOW)[number];

export function canTransition(from: MeasurementStatus, to: MeasurementStatus): boolean {
  return MEASUREMENT_FLOW.indexOf(to) === MEASUREMENT_FLOW.indexOf(from) + 1;
}
