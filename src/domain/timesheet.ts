export interface PunchSet {
  clockIn: Date | null;
  breakStart: Date | null;
  breakEnd: Date | null;
  clockOut: Date | null;
}

export class TimesheetError extends Error {}

const H = 3_600_000;

/**
 * Horas trabalhadas (§20) = (saída − entrada) − intervalo.
 * Horas além da jornada padrão viram hora extra.
 */
export function computeWorkedHours(p: PunchSet, standardHours = 8): { worked: number; overtime: number } {
  if (!p.clockIn || !p.clockOut) return { worked: 0, overtime: 0 };
  if (p.clockOut <= p.clockIn) throw new TimesheetError("Saída deve ser após a entrada.");
  let ms = p.clockOut.getTime() - p.clockIn.getTime();
  if (p.breakStart && p.breakEnd) {
    if (p.breakEnd <= p.breakStart) throw new TimesheetError("Fim do intervalo deve ser após o início.");
    if (p.breakStart < p.clockIn || p.breakEnd > p.clockOut) throw new TimesheetError("Intervalo fora da jornada.");
    ms -= p.breakEnd.getTime() - p.breakStart.getTime();
  }
  const worked = Math.round((ms / H) * 100) / 100;
  return { worked, overtime: Math.max(Math.round((worked - standardHours) * 100) / 100, 0) };
}

export type PunchKind = "clockIn" | "breakStart" | "breakEnd" | "clockOut";

/** Próxima batida esperada — usado no botão único "BATER PONTO". */
export function nextPunch(p: PunchSet): PunchKind | null {
  if (!p.clockIn) return "clockIn";
  if (!p.breakStart && !p.clockOut) return "breakStart";
  if (p.breakStart && !p.breakEnd) return "breakEnd";
  if (!p.clockOut) return "clockOut";
  return null;
}

export const PUNCH_LABEL: Record<PunchKind, string> = {
  clockIn: "Entrada",
  breakStart: "Início do intervalo",
  breakEnd: "Fim do intervalo",
  clockOut: "Saída",
};

/** Custo da mão de obra do dia. Horas extras com adicional configurável (padrão 50%). */
export function laborCost(worked: number, overtime: number, hourlyRate: number, overtimePremium = 0.5): number {
  const regular = worked - overtime;
  return Math.round((regular * hourlyRate + overtime * hourlyRate * (1 + overtimePremium)) * 100) / 100;
}
