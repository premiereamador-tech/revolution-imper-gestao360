import type { HealthLevel } from "./health";

/**
 * Revolution Insights (§58): regras determinísticas sobre os dados.
 * A interface `InsightProvider` permite plugar um modelo de IA no futuro
 * sem alterar as telas — ele só precisa devolver `Insight[]`.
 */
export type InsightSeverity = "critico" | "atencao" | "positivo" | "info";
export type InsightArea = "financeiro" | "obras" | "equipe" | "estoque" | "qualidade" | "comercial" | "seguranca";

export interface Insight {
  id: string;
  area: InsightArea;
  severity: InsightSeverity;
  title: string;
  detail?: string;
  /** Peso para ranquear "os 5 maiores problemas". */
  priority: number;
  href?: string;
}

export interface ProjectSnapshot {
  id: string;
  code: string;
  name: string;
  health: HealthLevel;
  delayDays: number | null;
  projectedMargin: number | null;
  projectedProfit: number;
  materialOverconsumptionPct: number | null;
  materialBudgetAlert: boolean;
  budgetOverrunPct: number | null;
  openNonconformities: number;
}

export interface TeamSnapshot {
  id: string;
  name: string;
  areaPerDay: number | null;
}

export interface InsightContext {
  today: string;
  overdueReceivables: number;
  overdueReceivablesCount: number;
  receivablesNext7: number;
  payablesNext7: number;
  overduePayables: number;
  cashFirstNegativeDate: string | null;
  cashLowestBalance: number;
  projects: ProjectSnapshot[];
  teams: TeamSnapshot[];
  lowStockProducts: number;
  expiringBatches: number;
  expiredBatches: number;
  productsWithoutSheet: number;
  expiringPpe: number;
  expiringTrainings: number;
  warrantiesExpiring: number;
  overdueEquipment: number;
  pendingApprovals: number;
  minMarginPct: number;
}

export interface InsightProvider {
  name: string;
  generate(ctx: InsightContext): Promise<Insight[]> | Insight[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

export function generateRuleInsights(ctx: InsightContext): Insight[] {
  const out: Insight[] = [];
  const add = (i: Insight) => out.push(i);

  if (ctx.cashFirstNegativeDate) {
    add({
      id: "cash-negative",
      area: "financeiro",
      severity: "critico",
      title: `No ritmo atual, o caixa poderá ficar negativo em ${fmtDate(ctx.cashFirstNegativeDate)}.`,
      detail: `Menor saldo projetado: ${brl(ctx.cashLowestBalance)}.`,
      priority: 100,
      href: "/financeiro/fluxo-de-caixa",
    });
  }
  if (ctx.overdueReceivables > 0) {
    add({
      id: "ar-overdue",
      area: "financeiro",
      severity: ctx.overdueReceivables > 20_000 ? "critico" : "atencao",
      title: `Existem ${brl(ctx.overdueReceivables)} vencidos a receber.`,
      detail: `${ctx.overdueReceivablesCount} título(s) em atraso.`,
      priority: 80 + Math.min(ctx.overdueReceivables / 5_000, 15),
      href: "/financeiro/receber?status=vencido",
    });
  }
  if (ctx.receivablesNext7 > 0) {
    add({
      id: "ar-next7",
      area: "financeiro",
      severity: "info",
      title: `${brl(ctx.receivablesNext7)} em recebimentos vencem nos próximos 7 dias.`,
      priority: 20,
      href: "/financeiro/receber",
    });
  }
  if (ctx.overduePayables > 0) {
    add({
      id: "ap-overdue",
      area: "financeiro",
      severity: "atencao",
      title: `${brl(ctx.overduePayables)} em contas a pagar vencidas.`,
      priority: 60,
      href: "/financeiro/pagar?status=vencido",
    });
  }
  if (ctx.payablesNext7 > 0) {
    add({
      id: "ap-next7",
      area: "financeiro",
      severity: "info",
      title: `${brl(ctx.payablesNext7)} a pagar nos próximos 7 dias.`,
      priority: 15,
      href: "/financeiro/pagar",
    });
  }

  for (const p of ctx.projects) {
    const href = `/obras/${p.id}`;
    if (p.projectedProfit < 0) {
      add({
        id: `loss-${p.id}`,
        area: "obras",
        severity: "critico",
        title: `A obra ${p.name} está projetando prejuízo de ${brl(Math.abs(p.projectedProfit))}.`,
        priority: 95,
        href: `${href}?tab=financeiro`,
      });
    } else if (p.projectedMargin !== null && p.projectedMargin < ctx.minMarginPct) {
      add({
        id: `margin-${p.id}`,
        area: "obras",
        severity: "atencao",
        title: `A obra ${p.name} está com margem projetada de ${p.projectedMargin.toFixed(1)}% (abaixo de ${ctx.minMarginPct}%).`,
        priority: 65,
        href: `${href}?tab=financeiro`,
      });
    }
    if (p.delayDays !== null && p.delayDays > 0) {
      add({
        id: `delay-${p.id}`,
        area: "obras",
        severity: p.delayDays >= 10 ? "critico" : "atencao",
        title: `A obra ${p.name} está ${p.delayDays} dia(s) atrasada na previsão de término.`,
        priority: 50 + Math.min(p.delayDays * 2, 40),
        href,
      });
    }
    if (p.materialOverconsumptionPct !== null && p.materialOverconsumptionPct >= 10) {
      add({
        id: `material-${p.id}`,
        area: "estoque",
        severity: p.materialOverconsumptionPct >= 20 ? "critico" : "atencao",
        title: `O consumo de material da obra ${p.name} está ${p.materialOverconsumptionPct.toFixed(0)}% acima do previsto.`,
        priority: 55 + Math.min(p.materialOverconsumptionPct, 30),
        href: `${href}?tab=materiais`,
      });
    } else if (p.materialBudgetAlert) {
      add({
        id: `material-budget-${p.id}`,
        area: "estoque",
        severity: "atencao",
        title: `Alerta de estouro de material na obra ${p.name}: gasto acima do avanço físico.`,
        priority: 58,
        href: `${href}?tab=financeiro`,
      });
    }
    if (p.openNonconformities > 0) {
      add({
        id: `nc-${p.id}`,
        area: "qualidade",
        severity: "atencao",
        title: `${p.openNonconformities} não conformidade(s) aberta(s) na obra ${p.name}.`,
        priority: 45,
        href: `${href}?tab=qualidade`,
      });
    }
  }

  const rated = ctx.teams.filter((t) => t.areaPerDay && t.areaPerDay > 0);
  if (rated.length >= 2) {
    const avg = rated.reduce((s, t) => s + (t.areaPerDay ?? 0), 0) / rated.length;
    for (const t of rated) {
      const diff = (((t.areaPerDay ?? 0) - avg) / avg) * 100;
      if (diff >= 10) {
        add({
          id: `team-up-${t.id}`,
          area: "equipe",
          severity: "positivo",
          title: `A ${t.name} apresenta produtividade ${diff.toFixed(0)}% superior à média.`,
          priority: 10,
          href: "/equipe/produtividade",
        });
      } else if (diff <= -15) {
        add({
          id: `team-down-${t.id}`,
          area: "equipe",
          severity: "info",
          title: `A ${t.name} está ${Math.abs(diff).toFixed(0)}% abaixo da média de produtividade — vale entender o contexto.`,
          priority: 25,
          href: "/equipe/produtividade",
        });
      }
    }
  }

  const simple: Array<[number, InsightArea, InsightSeverity, string, number, string]> = [
    [ctx.expiredBatches, "estoque", "critico", `${ctx.expiredBatches} lote(s) de material vencido(s) em estoque.`, 70, "/suprimentos/estoque?alerta=vencido"],
    [ctx.expiringBatches, "estoque", "atencao", `${ctx.expiringBatches} lote(s) vencem nos próximos 30 dias.`, 35, "/suprimentos/estoque?alerta=vencendo"],
    [ctx.lowStockProducts, "estoque", "atencao", `${ctx.lowStockProducts} produto(s) abaixo do estoque mínimo.`, 40, "/suprimentos/estoque?alerta=minimo"],
    [ctx.productsWithoutSheet, "estoque", "info", `${ctx.productsWithoutSheet} produto(s) sem ficha técnica cadastrada.`, 12, "/suprimentos/estoque?alerta=ficha"],
    [ctx.expiringPpe, "seguranca", "atencao", `${ctx.expiringPpe} EPI(s) com troca prevista nos próximos 15 dias.`, 30, "/equipe/seguranca"],
    [ctx.expiringTrainings, "seguranca", "atencao", `${ctx.expiringTrainings} treinamento(s) vencendo em 30 dias.`, 30, "/equipe/seguranca"],
    [ctx.warrantiesExpiring, "obras", "info", `${ctx.warrantiesExpiring} garantia(s) vencendo nos próximos 60 dias — oportunidade de pós-venda.`, 18, "/garantias"],
    [ctx.overdueEquipment, "obras", "atencao", `${ctx.overdueEquipment} equipamento(s) com devolução atrasada.`, 28, "/patrimonio"],
    [ctx.pendingApprovals, "financeiro", "info", `${ctx.pendingApprovals} aprovação(ões) aguardando decisão.`, 32, "/aprovacoes"],
  ];
  simple.forEach(([n, area, severity, title, priority, href], i) => {
    if (n > 0) add({ id: `simple-${i}`, area, severity, title, priority, href });
  });

  return out.sort((a, b) => b.priority - a.priority);
}

/** Os N maiores problemas (exclui insights positivos/informativos de baixa prioridade). */
export function topProblems(insights: Insight[], n = 5): Insight[] {
  return insights.filter((i) => i.severity === "critico" || i.severity === "atencao").slice(0, n);
}

export const ruleBasedProvider: InsightProvider = { name: "regras", generate: generateRuleInsights };
