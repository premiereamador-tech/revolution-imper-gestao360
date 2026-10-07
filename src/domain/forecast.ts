import { addBusinessDays, diffDays } from "./dates";

export interface CompletionInput {
  contractedArea: number;
  executedArea: number;
  /** Dias efetivamente trabalhados (com produção registrada). */
  workedDays: number;
  /** Produção média por dia trabalhado (m²/dia). Se ausente, calculada. */
  avgDailyArea?: number | null;
  /** Meta diária planejada — usada quando ainda não há histórico. */
  plannedDailyArea?: number | null;
  today: string;
  contractualEnd: string | null;
}

export interface CompletionForecast {
  remainingArea: number;
  dailyRate: number | null;
  remainingWorkDays: number | null;
  forecastEnd: string | null;
  /** Positivo = atraso; negativo = adiantado. */
  delayDays: number | null;
  basis: "historico" | "planejado" | "sem_dados" | "concluida";
}

/**
 * Previsão de término (§90): m² restantes ÷ ritmo médio, contados em dias úteis.
 */
export function forecastCompletion(input: CompletionInput): CompletionForecast {
  const remainingArea = Math.max(input.contractedArea - input.executedArea, 0);
  if (input.contractedArea > 0 && remainingArea === 0) {
    return { remainingArea: 0, dailyRate: null, remainingWorkDays: 0, forecastEnd: input.today, delayDays: input.contractualEnd ? Math.max(diffDays(input.contractualEnd, input.today), 0) : null, basis: "concluida" };
  }

  let dailyRate: number | null = null;
  let basis: CompletionForecast["basis"] = "sem_dados";
  if (input.avgDailyArea && input.avgDailyArea > 0) {
    dailyRate = input.avgDailyArea;
    basis = "historico";
  } else if (input.workedDays > 0 && input.executedArea > 0) {
    dailyRate = input.executedArea / input.workedDays;
    basis = "historico";
  } else if (input.plannedDailyArea && input.plannedDailyArea > 0) {
    dailyRate = input.plannedDailyArea;
    basis = "planejado";
  }

  if (!dailyRate) {
    return { remainingArea, dailyRate: null, remainingWorkDays: null, forecastEnd: null, delayDays: null, basis };
  }

  const remainingWorkDays = Math.ceil(remainingArea / dailyRate);
  const forecastEnd = addBusinessDays(input.today, remainingWorkDays);
  const delayDays = input.contractualEnd ? diffDays(input.contractualEnd, forecastEnd) : null;
  return {
    remainingArea,
    dailyRate: Math.round(dailyRate * 100) / 100,
    remainingWorkDays,
    forecastEnd,
    delayDays,
    basis,
  };
}
