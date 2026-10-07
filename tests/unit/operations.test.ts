import { describe, expect, it } from "vitest";
import { computeMeasurement, computeMeasurementItem, canTransition, MeasurementError } from "@/domain/measurement";
import { assertAvailable, balanceFor, batchAlert, StockError, validateMovement, weightedAverageCost } from "@/domain/stock";
import { computeWorkedHours, laborCost, nextPunch, TimesheetError } from "@/domain/timesheet";
import { forecastCompletion } from "@/domain/forecast";
import { computeHealth } from "@/domain/health";
import { canApprove, requiredApprover } from "@/domain/approvals";
import { DEFAULT_ROLES, hasPermission } from "@/domain/permissions";
import { isValidCNPJ, isValidCPF, formatDocument } from "@/domain/br";
import { generateRuleInsights, topProblems, type InsightContext } from "@/domain/insights";
import { addBusinessDays, addMonths } from "@/domain/dates";

describe("medições (§27)", () => {
  it("calcula acumulado, % e valor", () => {
    const i = computeMeasurementItem({ service: "Manta", contractedQuantity: 100, previousQuantity: 40, currentQuantity: 30, unitPrice: 85 });
    expect(i.accumulatedQuantity).toBe(70);
    expect(i.accumulatedPct).toBe(70);
    expect(i.value).toBe(2550);
  });
  it("bloqueia medição acima do contratado", () => {
    expect(() =>
      computeMeasurementItem({ service: "Manta", contractedQuantity: 100, previousQuantity: 90, currentQuantity: 11, unitPrice: 1 }),
    ).toThrow(MeasurementError);
  });
  it("aplica retenção contratual", () => {
    const m = computeMeasurement(
      [
        { service: "A", contractedQuantity: 100, previousQuantity: 0, currentQuantity: 50, unitPrice: 100 },
        { service: "B", contractedQuantity: 10, previousQuantity: 0, currentQuantity: 10, unitPrice: 250 },
      ],
      5,
    );
    expect(m.grossValue).toBe(7500);
    expect(m.retentionValue).toBe(375);
    expect(m.netValue).toBe(7125);
  });
  it("segue o fluxo prevista → executada → aprovada → faturada → recebida", () => {
    expect(canTransition("executada", "aprovada")).toBe(true);
    expect(canTransition("executada", "faturada")).toBe(false);
  });
});

describe("estoque (§38)", () => {
  const moves = [
    { type: "entrada" as const, quantity: 100, fromWarehouseId: null, toWarehouseId: "central" },
    { type: "transferencia" as const, quantity: 30, fromWarehouseId: "central", toWarehouseId: "obra1" },
    { type: "consumo" as const, quantity: 12, fromWarehouseId: "obra1", toWarehouseId: null },
    { type: "devolucao" as const, quantity: 5, fromWarehouseId: "obra1", toWarehouseId: "central" },
    { type: "perda" as const, quantity: 2, fromWarehouseId: "central", toWarehouseId: null },
  ];
  it("calcula saldo por depósito", () => {
    expect(balanceFor(moves, "central")).toBe(73);
    expect(balanceFor(moves, "obra1")).toBe(13);
  });
  it("impede saída sem saldo", () => {
    expect(() => assertAvailable(13, 14)).toThrow(StockError);
    expect(() => assertAvailable(13, 13)).not.toThrow();
  });
  it("exige obra no consumo e origem ≠ destino na transferência", () => {
    expect(() => validateMovement({ type: "consumo", quantity: 1, fromWarehouseId: "a", toWarehouseId: null })).toThrow(StockError);
    expect(() => validateMovement({ type: "transferencia", quantity: 1, fromWarehouseId: "a", toWarehouseId: "a" })).toThrow(StockError);
    expect(() => validateMovement({ type: "entrada", quantity: 0, fromWarehouseId: null, toWarehouseId: "a" })).toThrow(StockError);
  });
  it("recalcula custo médio ponderado", () => {
    expect(weightedAverageCost(10, 100, 10, 120)).toBe(110);
  });
  it("alerta lotes vencidos e vencendo", () => {
    expect(batchAlert({ expiresAt: "2026-09-30" }, "2026-10-07")).toBe("vencido");
    expect(batchAlert({ expiresAt: "2026-10-20" }, "2026-10-07")).toBe("vencendo");
    expect(batchAlert({ expiresAt: "2027-10-20" }, "2026-10-07")).toBeNull();
    expect(batchAlert({ expiresAt: null, blocked: true }, "2026-10-07")).toBe("bloqueado");
  });
});

describe("ponto digital (§20)", () => {
  const d = (h: string) => new Date(`2026-10-07T${h}:00-03:00`);
  it("desconta intervalo e calcula hora extra", () => {
    const r = computeWorkedHours({ clockIn: d("07:00"), breakStart: d("12:00"), breakEnd: d("13:00"), clockOut: d("17:30") });
    expect(r).toEqual({ worked: 9.5, overtime: 1.5 });
    expect(laborCost(r.worked, r.overtime, 20)).toBe(205);
  });
  it("valida sequência de batidas", () => {
    expect(() => computeWorkedHours({ clockIn: d("10:00"), breakStart: null, breakEnd: null, clockOut: d("09:00") })).toThrow(TimesheetError);
    expect(nextPunch({ clockIn: null, breakStart: null, breakEnd: null, clockOut: null })).toBe("clockIn");
    expect(nextPunch({ clockIn: d("07:00"), breakStart: d("12:00"), breakEnd: null, clockOut: null })).toBe("breakEnd");
  });
});

describe("previsão de término (§90)", () => {
  it("projeta por ritmo histórico em dias úteis e calcula atraso", () => {
    const f = forecastCompletion({
      contractedArea: 1000,
      executedArea: 400,
      workedDays: 10,
      today: "2026-10-07",
      contractualEnd: "2026-10-30",
    });
    expect(f.dailyRate).toBe(40);
    expect(f.remainingWorkDays).toBe(15);
    expect(f.forecastEnd).toBe(addBusinessDays("2026-10-07", 15));
    expect(f.delayDays).toBe(-2);
  });
  it("usa meta planejada quando não há histórico", () => {
    const f = forecastCompletion({ contractedArea: 100, executedArea: 0, workedDays: 0, plannedDailyArea: 20, today: "2026-10-07", contractualEnd: null });
    expect(f.basis).toBe("planejado");
    expect(f.remainingWorkDays).toBe(5);
  });
});

describe("semáforo (§6)", () => {
  const ok = {
    projectedDelayDays: 0, budgetOverrunPct: 0, overdueReceivables: 0, materialOverconsumptionPct: 0,
    productivityRatio: 1, openNonconformities: 0, criticalNonconformities: 0, projectedMarginPct: 35, isLosingMoney: false,
  };
  it("verde quando saudável", () => expect(computeHealth(ok).level).toBe("verde"));
  it("amarelo com sinais de atenção, explicando os motivos", () => {
    const h = computeHealth({ ...ok, projectedDelayDays: 4, openNonconformities: 1 });
    expect(h.level).toBe("amarelo");
    expect(h.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["atraso", "qualidade"]));
  });
  it("vermelho quando a obra projeta prejuízo", () => {
    expect(computeHealth({ ...ok, isLosingMoney: true }).level).toBe("vermelho");
  });
  it("vermelho com atraso crítico + estouro crítico", () => {
    expect(computeHealth({ ...ok, projectedDelayDays: 15, budgetOverrunPct: 20 }).level).toBe("vermelho");
  });
});

describe("aprovações (§74) e permissões (§51)", () => {
  it("até R$ 500 supervisor; acima, diretoria", () => {
    expect(requiredApprover("compra", 500)).toBe("supervisor");
    expect(requiredApprover("compra", 500.01)).toBe("diretoria");
  });
  it("diretoria aprova qualquer alçada; supervisor não aprova a da diretoria", () => {
    expect(canApprove("diretoria", "supervisor")).toBe(true);
    expect(canApprove("supervisor", "diretoria")).toBe(false);
  });
  it("cliente não vê custos; aplicador não vê financeiro", () => {
    const perms = (k: string) => DEFAULT_ROLES.find((r) => r.key === k)!.permissions;
    expect(hasPermission(perms("cliente"), "projects:finance")).toBe(false);
    expect(hasPermission(perms("aplicador"), "finance:view")).toBe(false);
    expect(hasPermission(perms("aplicador"), ["field:use", "timesheet:self"])).toBe(true);
    expect(hasPermission(perms("admin"), "settings:manage")).toBe(true);
    expect(hasPermission(perms("diretoria"), "owner:view")).toBe(true);
  });
});

describe("padrão brasileiro (§62)", () => {
  it("valida CPF e CNPJ", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11.222.333/0001-82")).toBe(false);
    expect(formatDocument("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("soma meses respeitando fim de mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("Revolution Insights (§58)", () => {
  const ctx: InsightContext = {
    today: "2026-10-07", overdueReceivables: 42_300, overdueReceivablesCount: 3, receivablesNext7: 35_000, payablesNext7: 0,
    overduePayables: 0, cashFirstNegativeDate: "2026-11-02", cashLowestBalance: -8_000, lowStockProducts: 2, expiringBatches: 0,
    expiredBatches: 0, productsWithoutSheet: 0, expiringPpe: 0, expiringTrainings: 0, warrantiesExpiring: 0, overdueEquipment: 0,
    pendingApprovals: 0, minMarginPct: 20,
    projects: [
      { id: "p1", code: "OB-1", name: "Residencial X", health: "amarelo", delayDays: 8, projectedMargin: 30, projectedProfit: 10_000, materialOverconsumptionPct: 17, materialBudgetAlert: false, budgetOverrunPct: 0, openNonconformities: 0 },
      { id: "p2", code: "OB-2", name: "Obra Z", health: "amarelo", delayDays: 0, projectedMargin: 15, projectedProfit: 3_000, materialOverconsumptionPct: null, materialBudgetAlert: false, budgetOverrunPct: 0, openNonconformities: 0 },
    ],
    teams: [
      { id: "a", name: "Equipe A", areaPerDay: 40 },
      { id: "b", name: "Equipe B", areaPerDay: 50 },
      { id: "c", name: "Equipe C", areaPerDay: 44 },
    ],
  };
  it("gera as mensagens do briefing e ordena por prioridade", () => {
    const list = generateRuleInsights(ctx);
    const titles = list.map((i) => i.title).join("\n");
    expect(titles).toContain("Residencial X está 8 dia(s) atrasada");
    expect(titles).toContain("17% acima do previsto");
    expect(titles).toMatch(/R\$\s?42\.300,00 vencidos/);
    expect(titles).toContain("Equipe B apresenta produtividade 12% superior");
    expect(titles).toContain("margem projetada de 15.0%");
    expect(list[0].id).toBe("cash-negative");
    expect(topProblems(list)).toHaveLength(5);
  });
});
