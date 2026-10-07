/**
 * Semáforo de saúde da obra (§6). Cada critério soma pontos; a classificação
 * final vem da soma e de "gatilhos críticos". Os limites são configuráveis
 * (tabela `settings`, chave `health.thresholds`).
 */
export type HealthLevel = "verde" | "amarelo" | "vermelho";

export interface HealthThresholds {
  delayDaysWarning: number;
  delayDaysCritical: number;
  budgetOverrunWarningPct: number;
  budgetOverrunCriticalPct: number;
  overdueReceivableWarning: number;
  overdueReceivableCritical: number;
  materialOverconsumptionPct: number;
  productivityLowRatio: number;
  minMarginWarningPct: number;
  yellowScore: number;
  redScore: number;
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  delayDaysWarning: 3,
  delayDaysCritical: 10,
  budgetOverrunWarningPct: 5,
  budgetOverrunCriticalPct: 15,
  overdueReceivableWarning: 1,
  overdueReceivableCritical: 20_000,
  materialOverconsumptionPct: 10,
  productivityLowRatio: 0.8,
  minMarginWarningPct: 20,
  yellowScore: 2,
  redScore: 5,
};

export interface HealthInput {
  /** Dias de atraso projetados (previsão de término − data contratual). */
  projectedDelayDays: number;
  /** Custo projetado vs. orçado, em % (positivo = estouro). */
  budgetOverrunPct: number | null;
  overdueReceivables: number;
  /** Consumo real/m² vs. previsto, em % (positivo = acima). */
  materialOverconsumptionPct: number | null;
  /** Produtividade real ÷ meta (1 = na meta). */
  productivityRatio: number | null;
  openNonconformities: number;
  criticalNonconformities: number;
  projectedMarginPct: number | null;
  isLosingMoney: boolean;
}

export interface HealthReason {
  code: string;
  severity: "atencao" | "critico";
  message: string;
  points: number;
}

export interface HealthResult {
  level: HealthLevel;
  score: number;
  reasons: HealthReason[];
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function computeHealth(input: HealthInput, t: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS): HealthResult {
  const reasons: HealthReason[] = [];
  const push = (code: string, severity: HealthReason["severity"], message: string, points: number) =>
    reasons.push({ code, severity, message, points });

  if (input.projectedDelayDays >= t.delayDaysCritical) {
    push("atraso", "critico", `Previsão de ${input.projectedDelayDays} dias de atraso em relação ao contrato.`, 3);
  } else if (input.projectedDelayDays >= t.delayDaysWarning) {
    push("atraso", "atencao", `Previsão de ${input.projectedDelayDays} dias de atraso.`, 1);
  }

  if (input.budgetOverrunPct !== null) {
    if (input.budgetOverrunPct >= t.budgetOverrunCriticalPct) {
      push("orcamento", "critico", `Custo projetado ${input.budgetOverrunPct.toFixed(1)}% acima do orçado.`, 3);
    } else if (input.budgetOverrunPct >= t.budgetOverrunWarningPct) {
      push("orcamento", "atencao", `Custo projetado ${input.budgetOverrunPct.toFixed(1)}% acima do orçado.`, 1);
    }
  }

  if (input.overdueReceivables >= t.overdueReceivableCritical) {
    push("recebimento", "critico", `${brl(input.overdueReceivables)} em recebimentos vencidos.`, 2);
  } else if (input.overdueReceivables >= t.overdueReceivableWarning) {
    push("recebimento", "atencao", `${brl(input.overdueReceivables)} em recebimentos vencidos.`, 1);
  }

  if (input.materialOverconsumptionPct !== null && input.materialOverconsumptionPct >= t.materialOverconsumptionPct) {
    push(
      "material",
      input.materialOverconsumptionPct >= t.materialOverconsumptionPct * 2 ? "critico" : "atencao",
      `Consumo de material ${input.materialOverconsumptionPct.toFixed(1)}% acima do previsto por m².`,
      input.materialOverconsumptionPct >= t.materialOverconsumptionPct * 2 ? 2 : 1,
    );
  }

  if (input.productivityRatio !== null && input.productivityRatio < t.productivityLowRatio) {
    push(
      "produtividade",
      "atencao",
      `Produtividade em ${(input.productivityRatio * 100).toFixed(0)}% da meta diária.`,
      1,
    );
  }

  if (input.criticalNonconformities > 0) {
    push("qualidade", "critico", `${input.criticalNonconformities} não conformidade(s) crítica(s) em aberto.`, 3);
  } else if (input.openNonconformities > 0) {
    push("qualidade", "atencao", `${input.openNonconformities} não conformidade(s) em aberto.`, 1);
  }

  if (input.isLosingMoney) {
    push("prejuizo", "critico", "Resultado projetado negativo: a obra está perdendo dinheiro.", 5);
  } else if (input.projectedMarginPct !== null && input.projectedMarginPct < t.minMarginWarningPct) {
    push("margem", "atencao", `Margem projetada de ${input.projectedMarginPct.toFixed(1)}%, abaixo da meta.`, 1);
  }

  const score = reasons.reduce((s, r) => s + r.points, 0);
  const hasCriticalTrigger = reasons.some((r) => r.code === "prejuizo");
  const level: HealthLevel =
    hasCriticalTrigger || score >= t.redScore ? "vermelho" : score >= t.yellowScore ? "amarelo" : "verde";

  reasons.sort((a, b) => b.points - a.points);
  return { level, score, reasons };
}
