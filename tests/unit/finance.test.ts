import { describe, expect, it } from "vitest";
import { percent, splitInstallments, sumMoney } from "@/domain/money";
import { computeProjectFinance, simpleProfit } from "@/domain/project-finance";
import { applyPayment, delinquencyRate, receivableStatus, PaymentError } from "@/domain/receivables";
import { projectCashflow } from "@/domain/cashflow";
import { buildDre } from "@/domain/dre";

describe("aritmética monetária", () => {
  it("soma sem erro de ponto flutuante", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([1000.1, 2000.2, null, undefined])).toBe(3000.3);
  });
  it("divide parcelas ajustando centavos na última", () => {
    expect(splitInstallments(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(sumMoney(splitInstallments(150_000, 7))).toBe(150_000);
  });
  it("percentual com divisor zero retorna null", () => {
    expect(percent(10, 0)).toBeNull();
  });
});

describe("margem da obra (§32)", () => {
  it("reproduz o exemplo do briefing: 150.000 − 92.000 = 58.000 (38,67%)", () => {
    expect(simpleProfit(150_000, 92_000)).toEqual({ profit: 58_000, margin: 38.67 });
  });

  it("calcula receita com aditivos, lucro realizado e projetado", () => {
    const r = computeProjectFinance({
      contractValue: 100_000,
      approvedAdditions: 20_000,
      budget: { materiais: 30_000, mao_de_obra: 30_000 },
      incurred: { materiais: 15_000, mao_de_obra: 15_000 },
      physicalProgress: 0.5,
      invoiced: 60_000,
      received: 40_000,
    });
    expect(r.revenue).toBe(120_000);
    expect(r.incurredCost).toBe(30_000);
    expect(r.projectedCost).toBe(60_000);
    expect(r.projectedProfit).toBe(60_000);
    expect(r.projectedMargin).toBe(50);
    expect(r.earnedRevenue).toBe(60_000);
    expect(r.realizedProfit).toBe(30_000);
    expect(r.toReceive).toBe(20_000);
    expect(r.toInvoice).toBe(60_000);
    expect(r.isLosingMoney).toBe(false);
  });

  it("projeta pela tendência quando gasta mais rápido do que avança e acusa prejuízo", () => {
    const r = computeProjectFinance({
      contractValue: 50_000,
      approvedAdditions: 0,
      budget: { materiais: 20_000, mao_de_obra: 20_000 },
      incurred: { materiais: 18_500, mao_de_obra: 20_000 },
      physicalProgress: 0.6,
      invoiced: 0,
      received: 0,
    });
    const mat = r.lines.find((l) => l.category === "materiais")!;
    // §91: R$ 18.500 de R$ 20.000 consumidos com 60% executado → alerta de estouro
    expect(mat.overrunAlert).toBe(true);
    expect(mat.projected).toBeCloseTo(30_833.33, 2);
    expect(r.projectedCost).toBeGreaterThan(50_000);
    expect(r.isLosingMoney).toBe(true);
  });

  it("não usa tendência antes de 15% de avanço (evita distorção no início)", () => {
    const r = computeProjectFinance({
      contractValue: 10_000,
      approvedAdditions: 0,
      budget: { materiais: 4_000 },
      incurred: { materiais: 3_000 },
      physicalProgress: 0.1,
      invoiced: 0,
      received: 0,
    });
    expect(r.projectedCost).toBe(4_000);
  });
});

describe("contas a receber (§29)", () => {
  const base = { dueDate: "2026-10-10", amount: 1000, discount: 0, interest: 0, receivedAmount: 0, forecast: false, cancelled: false };

  it("deriva status por data e pagamentos", () => {
    expect(receivableStatus(base, "2026-10-01")).toBe("a_vencer");
    expect(receivableStatus(base, "2026-10-11")).toBe("vencido");
    expect(receivableStatus({ ...base, receivedAmount: 400 }, "2026-10-01")).toBe("parcial");
    expect(receivableStatus({ ...base, receivedAmount: 1000 }, "2026-12-01")).toBe("recebido");
    expect(receivableStatus({ ...base, forecast: true }, "2026-10-01")).toBe("previsto");
    expect(receivableStatus({ ...base, cancelled: true }, "2026-10-01")).toBe("cancelado");
  });

  it("aplica baixa parcial e total com juros e desconto", () => {
    const r = { ...base, interest: 20, discount: 10 };
    const p1 = applyPayment(r, 500);
    expect(p1).toEqual({ receivedAmount: 500, fullyPaid: false });
    const p2 = applyPayment({ ...r, receivedAmount: 500 }, 510);
    expect(p2.fullyPaid).toBe(true);
  });

  it("recusa baixa acima do saldo ou em título cancelado", () => {
    expect(() => applyPayment(base, 1000.5)).toThrow(PaymentError);
    expect(() => applyPayment({ ...base, cancelled: true }, 10)).toThrow(PaymentError);
    expect(() => applyPayment(base, 0)).toThrow(PaymentError);
  });

  it("calcula inadimplência sobre títulos vencidos", () => {
    const items = [
      { ...base, dueDate: "2026-09-01", receivedAmount: 1000 },
      { ...base, dueDate: "2026-09-15" },
      { ...base, dueDate: "2026-12-01" },
    ];
    expect(delinquencyRate(items, "2026-10-01")).toBe(50);
  });
});

describe("fluxo de caixa (§34)", () => {
  it("projeta saldo diário e detecta o primeiro dia negativo", () => {
    const p = projectCashflow(
      10_000,
      [
        { date: "2026-10-02", amount: 5_000, direction: "in" },
        { date: "2026-10-05", amount: 20_000, direction: "out" },
        { date: "2026-10-08", amount: 8_000, direction: "in" },
        { date: "2026-09-20", amount: 1_000, direction: "in" }, // vencido: entra hoje
        { date: "2026-12-31", amount: 999, direction: "out" }, // fora do horizonte
      ],
      "2026-10-01",
      10,
    );
    expect(p.days[0].balance).toBe(11_000);
    expect(p.firstNegativeDate).toBe("2026-10-05");
    expect(p.lowestBalance).toBe(-4_000);
    expect(p.closingBalance).toBe(4_000);
    expect(p.totalOut).toBe(20_000);
  });
});

describe("DRE gerencial (§31)", () => {
  it("encadeia receita, custos, margem de contribuição e lucro líquido", () => {
    const d = buildDre({
      grossRevenue: 100_000,
      deductions: 6_000,
      directCosts: { materiais: 30_000, mao_de_obra: 20_000, transporte: 2_000 },
      administrativeExpenses: 10_000,
      financialResult: -500,
    });
    const v = Object.fromEntries(d.lines.map((l) => [l.key, l.value]));
    expect(v.receita_liquida).toBe(94_000);
    expect(v.margem_contribuicao).toBe(42_000);
    expect(v.resultado_operacional).toBe(32_000);
    expect(d.netProfit).toBe(31_500);
    expect(d.netMargin).toBe(33.51);
  });
});
