import type { Metadata } from "next";
import { and, eq, sql } from "drizzle-orm";
import { InsightList } from "@/components/domain/insight-list";
import { Card, CardHeader, Kpi, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { delinquencyRate } from "@/domain/receivables";
import { money, moneyShort, number, pct } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { accountsReceivable, dailyLogs, leads, nonconformities, projects } from "@/server/db/schema";
import { loadOperationalSnapshot } from "@/server/services/insights";

export const metadata: Metadata = { title: "Revolution Insights" };

export default async function InsightsPage() {
  const user = await requireUser("insights:view");
  const snap = await loadOperationalSnapshot(user.companyId);
  const { summaries, today } = snap;
  const [ar, [hours], [nc], [ld]] = await Promise.all([
    db.select().from(accountsReceivable).where(and(eq(accountsReceivable.companyId, user.companyId), eq(accountsReceivable.cancelled, false))),
    db.select({ h: sql<string>`coalesce(sum(${dailyLogs.hoursWorked}), 0)`, a: sql<string>`coalesce(sum(${dailyLogs.executedArea}), 0)` }).from(dailyLogs).innerJoin(projects, eq(projects.id, dailyLogs.projectId)).where(eq(projects.companyId, user.companyId)),
    db.select({ rework: sql<string>`count(*) filter (where ${nonconformities.isRework})` }).from(nonconformities).innerJoin(projects, eq(projects.id, nonconformities.projectId)).where(eq(projects.companyId, user.companyId)),
    db.select({ won: sql<string>`count(*) filter (where ${leads.stage} = 'fechado')`, decided: sql<string>`count(*) filter (where ${leads.stage} in ('fechado','perdido'))` }).from(leads).where(eq(leads.companyId, user.companyId)),
  ]);
  const withArea = summaries.filter((p) => p.executedArea > 0);
  const execArea = withArea.reduce((s, p) => s + p.executedArea, 0);
  const cost = withArea.reduce((s, p) => s + p.finance.incurredCost, 0);
  const earned = withArea.reduce((s, p) => s + p.finance.earnedRevenue, 0);
  const material = withArea.reduce((s, p) => s + (p.finance.lines.find((l) => l.category === "materiais")?.incurred ?? 0), 0);
  const open = summaries.filter((p) => p.statusCategory === "ativa" || p.statusCategory === "pausada" || p.statusCategory === "pre_obra");
  const backlog = open.reduce((s, p) => s + p.finance.revenue - p.finance.earnedRevenue, 0);
  const futureAr = ar.filter((r) => r.dueDate >= today).reduce((s, r) => s + Math.max(r.amount - r.discount + r.interest - r.receivedAmount, 0), 0);
  const finished = summaries.filter((p) => p.actualEnd && p.adjustedPlannedEnd);
  const onTime = finished.filter((p) => (p.forecast.delayDays ?? 0) <= 0).length;
  const teamAvg = snap.ctx.teams.filter((t) => t.areaPerDay).reduce((s, t, _, arr) => s + (t.areaPerDay ?? 0) / arr.length, 0);

  return (
    <>
      <PageHeader title="Revolution Insights" description="Leituras automáticas a partir de regras e cálculos internos. A arquitetura aceita um provedor de IA no futuro sem mudar as telas." />
      <h2 className="mb-3 text-sm font-semibold text-muted">Indicadores-chave</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Custo por m²" value={money(execArea ? cost / execArea : 0)} hint="Obras com produção" />
        <Kpi label="Receita por m²" value={money(execArea ? earned / execArea : 0)} />
        <Kpi label="Material por m²" value={money(execArea ? material / execArea : 0)} />
        <Kpi label="Horas por m²" value={number(Number(hours.a) ? Number(hours.h) / Number(hours.a) : 0, 2)} />
        <Kpi label="Produtividade média" value={`${number(teamAvg, 1)} m²/dia`} hint="Por equipe, 30 dias" />
        <Kpi label="Prazo cumprido" value={finished.length ? pct((onTime / finished.length) * 100, 0) : "—"} hint="Obras concluídas" />
        <Kpi label="Retrabalho" value={pct(execArea ? (Number(nc.rework) / execArea) * 1000 : null, 2).replace("%", "")} hint="Ocorrências por 1.000 m²" />
        <Kpi label="Inadimplência" value={pct(delinquencyRate(ar, today))} />
        <Kpi label="Conversão comercial" value={pct(Number(ld.decided) ? (Number(ld.won) / Number(ld.decided)) * 100 : null, 0)} />
        <Kpi label="Ticket médio" value={moneyShort(summaries.length ? summaries.reduce((s, p) => s + p.finance.revenue, 0) / summaries.length : 0)} />
        <Kpi label="Valor em carteira" value={moneyShort(backlog)} hint="A executar das obras abertas" />
        <Kpi label="Backlog de obras" value={open.length} />
        <Kpi label="Recebíveis futuros" value={moneyShort(futureAr)} />
        <Kpi label="Margem média projetada" value={pct(open.length ? open.reduce((s, p) => s + (p.finance.projectedMargin ?? 0), 0) / open.length : null)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader title="O que o sistema está vendo" description={`${snap.insights.length} leitura(s) agora`} />
          <InsightList insights={snap.insights} />
        </Card>
        <Card>
          <CardHeader title="Margem por obra" />
          <Table>
            <thead>
              <tr>
                <Th>Obra</Th>
                <Th align="right">Planejada</Th>
                <Th align="right">Realizada</Th>
                <Th align="right">Projetada</Th>
              </tr>
            </thead>
            <tbody>
              {summaries
                .filter((p) => p.statusCategory !== "cancelada")
                .map((p) => (
                  <tr key={p.id}>
                    <Td>{p.code}</Td>
                    <Td align="right">{pct(p.finance.plannedMargin)}</Td>
                    <Td align="right">{pct(p.finance.realizedMargin)}</Td>
                    <Td align="right" className={p.finance.isLosingMoney ? "font-medium text-danger" : ""}>
                      {pct(p.finance.projectedMargin)}
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
