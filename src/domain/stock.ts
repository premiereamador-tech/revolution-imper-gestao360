export type StockMovementType =
  | "entrada"
  | "saida"
  | "transferencia"
  | "devolucao"
  | "perda"
  | "consumo"
  | "ajuste";

export interface StockMovementLike {
  type: StockMovementType;
  quantity: number;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
}

export class StockError extends Error {}

/**
 * Regras de origem/destino por tipo de movimento.
 * entrada/devolução: entram em `to`; saída/perda/consumo: saem de `from`;
 * transferência: sai de `from` e entra em `to`; ajuste: sinal da quantidade em `to`.
 */
export function validateMovement(m: StockMovementLike & { projectId?: string | null }) {
  if (m.type !== "ajuste" && !(m.quantity > 0)) throw new StockError("A quantidade deve ser maior que zero.");
  switch (m.type) {
    case "entrada":
    case "devolucao":
      if (!m.toWarehouseId) throw new StockError("Informe o estoque de destino.");
      break;
    case "saida":
    case "perda":
      if (!m.fromWarehouseId) throw new StockError("Informe o estoque de origem.");
      break;
    case "consumo":
      if (!m.fromWarehouseId) throw new StockError("Informe o estoque de origem.");
      if (!m.projectId) throw new StockError("Consumo precisa estar vinculado a uma obra.");
      break;
    case "transferencia":
      if (!m.fromWarehouseId || !m.toWarehouseId) throw new StockError("Informe origem e destino.");
      if (m.fromWarehouseId === m.toWarehouseId) throw new StockError("Origem e destino iguais.");
      break;
    case "ajuste":
      if (!m.toWarehouseId) throw new StockError("Informe o estoque ajustado.");
      break;
  }
}

/** Efeito do movimento no saldo de um depósito específico. */
export function movementDelta(m: StockMovementLike, warehouseId: string): number {
  let delta = 0;
  if (m.toWarehouseId === warehouseId) delta += m.type === "ajuste" ? m.quantity : Math.abs(m.quantity);
  if (m.fromWarehouseId === warehouseId && m.type !== "ajuste") delta -= Math.abs(m.quantity);
  return delta;
}

export function balanceFor(movements: StockMovementLike[], warehouseId: string): number {
  return Math.round(movements.reduce((s, m) => s + movementDelta(m, warehouseId), 0) * 1000) / 1000;
}

/** Garante que uma saída não deixe o saldo negativo. */
export function assertAvailable(current: number, requested: number, label = "produto") {
  if (requested - current > 1e-9) {
    throw new StockError(`Saldo insuficiente de ${label}: disponível ${current}, solicitado ${requested}.`);
  }
}

/** Custo médio ponderado após uma entrada. */
export function weightedAverageCost(currentQty: number, currentCost: number, inQty: number, inCost: number): number {
  const total = currentQty + inQty;
  if (total <= 0) return Math.round(inCost * 100) / 100;
  return Math.round(((Math.max(currentQty, 0) * currentCost + inQty * inCost) / total) * 100) / 100;
}

export interface BatchLike {
  expiresAt: string | null;
  blocked?: boolean;
}

export function batchAlert(batch: BatchLike, today: string, warnDays = 30): "vencido" | "vencendo" | "bloqueado" | null {
  if (batch.blocked) return "bloqueado";
  if (!batch.expiresAt) return null;
  if (batch.expiresAt < today) return "vencido";
  const warn = new Date(Date.parse(today) + warnDays * 86_400_000).toISOString().slice(0, 10);
  return batch.expiresAt <= warn ? "vencendo" : null;
}
