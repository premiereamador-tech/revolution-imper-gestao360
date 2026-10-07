import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { InsightList } from "@/components/domain/insight-list";
import { HealthDot } from "@/components/ui/health";
import { Card, CardHeader } from "@/components/ui/primitives";
import { Waterline } from "@/components/ui/waterline";
import { addDays } from "@/domain/dates";
import { topProblems } from "@/domain/insights";
import { cn } from "@/lib/cn";
import { money0, moneyShort, pct, plural } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { leads, projects, warranties } from "@/server/db/schema";
import { loadExecutiveDashboard } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Central do Dono" };

export default async function CentralDoDono() {
  const user = await requireUser("owner:view");
  const d = await loadExecutiveDashboard(user.companyId);
  const k = d.kpi;
  const s = d.snap;
  const [w] = await db
    .select({ active: sql<string>`count(*) filter (where ${warranties.endsAt} >= ${d.today})`, soon: sql<string>`count(*) filter (where ${warranties.endsAt} between ${d.today} and ${addDays(d.today, 60)})` })
    .from(warranties)
    .innerJoin(projects, eq(projects.id, warranties.projectId))
    .where(eq(projects.companyId, user.companyId));
  const [pipeline] = await db
    .select({ v: sql<string>`coalesce(sum(${leads.estimatedValue}), 0)`, c: sql<string>`count(*)` })
    .from(leads)
    .where(and(eq(leads.companyId, user.companyId), sql`${leads.stage} not in ('fechado','perdido')`));

  const running = s.summaries.filter((p) => p.statusCategory === "ativa" || p.statusCategory === "pausada");
  const critical = running.filter((p) => p.health.level === "vermelho").length;
  const losing = running.filter((p) => p.finance.isLosingMoney);
  const problems = topProblems(s.insights, 5);
  const negative = s.cash.projection.firstNegativeDate;

  const tiles: Array<{ label: string; value: string; note?: string; href: string; tone?: "neg" | "pos" | "warn" }> = [
    { label: "Caixa", value: moneyShort(d.cash.balance), note: `Em 30 dias: ${moneyShort(d.cash.projected30)}`, href: "/financeiro/fluxo-de-caixa", tone: d.cash.projected30 < 0 ? "neg" : undefined },
    { label: "A receber", value: moneyShort(d.totals.openReceivables), note: `${moneyShort(k.overdueReceivables)} vencidos`, href: "/financeiro/receber", tone: k.overdueReceivables > 0 ? "warn" : undefined },
    { label: "A pagar", value: moneyShort(d.totals.openPayables), note: `${moneyShort(s.ctx.payablesNext7)} nos próximos 7 dias`, href: "/financeiro/pagar" },
    { label: "Faturamento do mês", value: moneyShort(d.totals.invoiced), note: `Recebido: ${moneyShort(d.totals.received)}`, href: "/financeiro" },
    { label: "Lucro do mês", value: moneyShort(d.dre.netProfit), note: "Resultado líquido (DRE)", href: "/financeiro/dre", tone: d.dre.netProfit < 0 ? "neg" : "pos" },
    { label: "Margem das obras", value: pct(k.averageMargin), note: losing.length ? `${plural(losing.length, "obra", "obras")} no prejuízo` : "Nenhuma obra no prejuízo", href: "/obras", tone: losing.length ? "neg" : undefined },
    { label: "Obras", value: String(k.activeProjects), note: `${critical} crítica(s) no semáforo`, href: "/obras?grupo=ativas", tone: critical ? "warn" : undefined },
    { label: "Atrasos", value: String(k.lateProjects), note: "Previsão de término após o contrato", href: "/obras?grupo=atrasadas", tone: k.lateProjects ? "neg" : undefined },
    { label: "Vendas", value: moneyShort(Number(pipeline.v)), note: `${pipeline.c} negociações abertas, conversão ${pct(k.conversion, 0)}`, href: "/comercial/leads" },
    { label: "Funcionários", value: String(k.activeEmployees), note: `Mão de obra no mês: ${moneyShort(k.laborCost)}`, href: "/equipe/funcionarios" },
    { label: "Estoque", value: moneyShort(k.stockValue), note: `${s.stock.alerts.lowStock} abaixo do mínimo, ${s.stock.alerts.expired + s.stock.alerts.expiring} lotes vencendo/vencidos`, href: "/suprimentos/estoque", tone: s.stock.alerts.expired ? "warn" : undefined },
    { label: "Garantias", value: String(Number(w.active)), note: `${w.soon} vencem em 60 dias`, href: "/garantias" },
  ];

  return (
    <>
      <section className="-mx-4 -mt-6 mb-6 bg-abyss px-4 pb-7 pt-7 text-white md:-mx-6 md:-mt-8 md:px-6 md:pt-9">
        <p className="text-sm text-white/60">Central do Dono</p>
        <h1 className="font-display mt-1 max-w-4xl text-[30px] font-semibold leading-tight md:text-[40px]">
          Caixa de {money0(d.cash.balance)},{" "}
          {k.overdueReceivables > 0 ? `${money0(k.overdueReceivables)} vencidos para cobrar` : "nada vencido para cobrar"} e{" "}
          {losing.length ? `${plural(losing.length, "obra perdendo", "obras perdendo")} dinheiro.` : "todas as obras dando lucro."}
        </h1>
        {negative ? (
          <p className="mt-3 inline-flex rounded-lg bg-danger px-3 py-1.5 text-sm font-medium">
            No ritmo atual o caixa fica negativo em {negative.split("-").reverse().join("/")}. Antecipe cobranças ou renegocie pagamentos.
          </p>
        ) : (
          <p className="mt-3 text-sm text-white/70">Sem risco de caixa negativo nos próximos 90 dias, considerando o que está lançado.</p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border md:grid-cols-3 xl:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className="bg-surface px-4 py-4 transition-colors hover:bg-surface-2">
              <p className="text-[13px] text-muted">{t.label}</p>
              <p
                className={cn(
                  "font-display mt-1 whitespace-nowrap text-[30px] font-semibold leading-none tabular",
                  t.tone === "neg" ? "text-danger" : t.tone === "pos" ? "text-success" : t.tone === "warn" ? "text-warning" : "text-text",
                )}
              >
                {t.value}
              </p>
              {t.note && <p className="mt-2 text-[12px] leading-snug text-muted">{t.note}</p>}
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader title="Os 5 maiores problemas agora" description="Ordenados pelo impacto no caixa, no prazo e na margem." />
          <InsightList insights={problems} numbered empty="Nenhum problema relevante. Bom trabalho." />
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Estou ganhando ou perdendo dinheiro em cada obra?" description="Barra escura: custo já gasto. Faixa clara: custo projetado até o fim. Traço preto: valor do contrato." />
        <ul className="divide-y divide-border">
          {running
            .sort((a, b) => (a.finance.projectedMargin ?? 0) - (b.finance.projectedMargin ?? 0))
            .map((p) => (
              <li key={p.id}>
                <Link href={`/obras/${p.id}?tab=financeiro`} className="grid items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_auto]">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <HealthDot level={p.health.level} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block text-[12px] text-muted">{pct(p.physicalProgress * 100, 0)} executado</span>
                    </span>
                  </span>
                  <Waterline finance={p.finance} size="sm" />
                  <span className={cn("font-display text-right text-xl font-semibold tabular", p.finance.isLosingMoney ? "text-danger" : "text-success")}>
                    {p.finance.projectedProfit >= 0 ? "+" : "−"}
                    {money0(Math.abs(p.finance.projectedProfit))}
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </Card>
    </>
  );
}
