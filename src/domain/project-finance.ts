import { percent, round2, sumMoney } from "./money";

export const COST_CATEGORIES = [
  "materiais",
  "mao_de_obra",
  "terceiros",
  "equipamentos",
  "transporte",
  "impostos",
  "outros",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  materiais: "Materiais",
  mao_de_obra: "Mão de obra",
  terceiros: "Terceiros",
  equipamentos: "Equipamentos",
  transporte: "Transporte",
  impostos: "Impostos",
  outros: "Outros custos",
};

export type ByCategory = Partial<Record<CostCategory, number>>;

export interface ProjectFinanceInput {
  contractValue: number;
  approvedAdditions: number;
  budget: ByCategory;
  incurred: ByCategory;
  /** Avanço físico 0–1. */
  physicalProgress: number;
  invoiced: number;
  received: number;
}

export interface CategoryLine {
  category: CostCategory;
  budget: number;
  incurred: number;
  projected: number;
  /** % do orçamento já consumido. */
  consumedPct: number | null;
  /** Consumo acima do avanço físico (ex.: 92% gasto com 60% executado). */
  overrunAlert: boolean;
}

export interface ProjectFinanceResult {
  revenue: number;
  incurredCost: number;
  budgetCost: number;
  projectedCost: number;
  remainingProjectedCost: number;
  realizedProfit: number;
  projectedProfit: number;
  /** Margem realizada: lucro sobre a receita proporcional ao avanço. */
  realizedMargin: number | null;
  projectedMargin: number | null;
  plannedMargin: number | null;
  earnedRevenue: number;
  invoiced: number;
  received: number;
  toReceive: number;
  toInvoice: number;
  isLosingMoney: boolean;
  lines: CategoryLine[];
}

/** A partir de qual avanço físico a tendência de gasto passa a projetar o custo final. */
export const TREND_MIN_PROGRESS = 0.15;
/** Tolerância antes de considerar consumo acima do avanço (pontos percentuais). */
export const OVERRUN_TOLERANCE = 0.1;

/**
 * Resultado financeiro da obra (§32, §89, §91).
 *
 * Custo projetado por categoria (conservador — nunca otimista):
 *   restante = max(orçado − incorrido, 0)
 *   se avanço ≥ 15%: projetado = max(incorrido + restante, incorrido ÷ avanço)
 * Assim, uma obra que gasta mais rápido do que avança tem seu custo final
 * projetado pela tendência real, e não pelo orçamento.
 */
export function computeProjectFinance(input: ProjectFinanceInput): ProjectFinanceResult {
  const progress = Math.min(Math.max(input.physicalProgress, 0), 1);
  const revenue = sumMoney([input.contractValue, input.approvedAdditions]);

  const lines: CategoryLine[] = COST_CATEGORIES.map((category) => {
    const budget = round2(input.budget[category] ?? 0);
    const incurred = round2(input.incurred[category] ?? 0);
    const byBudget = incurred + Math.max(budget - incurred, 0);
    const byTrend = progress >= TREND_MIN_PROGRESS ? incurred / progress : 0;
    const projected = round2(Math.max(byBudget, byTrend));
    const consumed = budget > 0 ? incurred / budget : null;
    const overrunAlert =
      budget > 0 && consumed !== null && (consumed > 1 || consumed - progress > OVERRUN_TOLERANCE);
    return {
      category,
      budget,
      incurred,
      projected,
      consumedPct: consumed === null ? null : Math.round(consumed * 10000) / 100,
      overrunAlert,
    };
  });

  const incurredCost = sumMoney(lines.map((l) => l.incurred));
  const budgetCost = sumMoney(lines.map((l) => l.budget));
  const projectedCost = sumMoney(lines.map((l) => l.projected));
  const earnedRevenue = round2(revenue * progress);
  const realizedProfit = round2(earnedRevenue - incurredCost);
  const projectedProfit = round2(revenue - projectedCost);

  return {
    revenue,
    incurredCost,
    budgetCost,
    projectedCost,
    remainingProjectedCost: round2(projectedCost - incurredCost),
    realizedProfit,
    projectedProfit,
    realizedMargin: percent(realizedProfit, earnedRevenue),
    projectedMargin: percent(projectedProfit, revenue),
    plannedMargin: percent(revenue - budgetCost, revenue),
    earnedRevenue,
    invoiced: round2(input.invoiced),
    received: round2(input.received),
    toReceive: round2(Math.max(input.invoiced - input.received, 0)),
    toInvoice: round2(Math.max(revenue - input.invoiced, 0)),
    isLosingMoney: projectedProfit < 0,
    lines,
  };
}

/** Resultado simples "contrato − custos" (exemplo do §32). */
export function simpleProfit(contract: number, costs: number) {
  const profit = round2(contract - costs);
  return { profit, margin: percent(profit, contract) };
}
