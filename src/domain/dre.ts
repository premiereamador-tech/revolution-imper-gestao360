import { percent, round2, sumMoney } from "./money";
import type { CostCategory } from "./project-finance";

export interface DreInput {
  grossRevenue: number;
  deductions: number;
  directCosts: Partial<Record<CostCategory, number>>;
  administrativeExpenses: number;
  financialResult: number;
}

export interface DreLine {
  key: string;
  label: string;
  value: number;
  level: 0 | 1 | 2;
  pctOfNet: number | null;
}

/** DRE gerencial (§31). Impostos sobre faturamento entram em deduções. */
export function buildDre(input: DreInput): { lines: DreLine[]; netProfit: number; netMargin: number | null } {
  const netRevenue = round2(input.grossRevenue - input.deductions);
  const dc = input.directCosts;
  const directTotal = sumMoney([dc.materiais, dc.mao_de_obra, dc.terceiros, dc.equipamentos, dc.transporte, dc.outros]);
  const contribution = round2(netRevenue - directTotal);
  const operating = round2(contribution - input.administrativeExpenses);
  const netProfit = round2(operating + input.financialResult);
  const p = (v: number) => percent(v, netRevenue);
  const l = (key: string, label: string, value: number, level: 0 | 1 | 2): DreLine => ({ key, label, value, level, pctOfNet: p(value) });

  return {
    netProfit,
    netMargin: p(netProfit),
    lines: [
      l("receita_bruta", "Receita bruta", input.grossRevenue, 0),
      l("deducoes", "(−) Deduções e impostos", -input.deductions, 1),
      l("receita_liquida", "Receita líquida", netRevenue, 0),
      l("materiais", "(−) Materiais", -(dc.materiais ?? 0), 1),
      l("mao_de_obra", "(−) Mão de obra", -(dc.mao_de_obra ?? 0), 1),
      l("terceiros", "(−) Terceiros", -(dc.terceiros ?? 0), 1),
      l("equipamentos", "(−) Equipamentos", -(dc.equipamentos ?? 0), 1),
      l("transporte", "(−) Transporte", -(dc.transporte ?? 0), 1),
      l("outros", "(−) Outras despesas diretas", -(dc.outros ?? 0), 1),
      l("despesas_diretas", "Total de despesas diretas", -directTotal, 2),
      l("margem_contribuicao", "Margem de contribuição", contribution, 0),
      l("despesas_adm", "(−) Despesas administrativas", -input.administrativeExpenses, 1),
      l("resultado_operacional", "Resultado operacional", operating, 0),
      l("resultado_financeiro", "(+/−) Resultado financeiro", input.financialResult, 1),
      l("lucro_liquido", "Lucro líquido", netProfit, 0),
    ],
  };
}
