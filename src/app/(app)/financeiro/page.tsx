import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { CashflowChart } from "@/components/charts/charts";
import { InsightList } from "@/components/domain/insight-list";
import { Card, CardHeader, Kpi, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { delinquencyRate } from "@/domain/receivables";
import { money, moneyShort, pct, shortDate } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { accountsReceivable, costCenters } from "@/server/db/schema";
import { loadOperationalSnapshot } from "@/server/services/insights";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinanceiroPage() {
  const user = await requireUser("finance:view");
  const snap = await loadOperationalSnapshot(user.companyId);
  const { cash, today } = snap;
  const ar = await db.select().from(accountsReceivable).where(and(eq(accountsReceivable.companyId, user.companyId), eq(accountsReceivable.cancelled, false)));
  const delinquency = delinquencyRate(ar, today);
  const proj30 = cash.projection.days[Math.min(30, cash.projection.days.length - 1)];
  const centers = await db
    .select({
      id: costCenters.id,
      code: costCenters.code,
      name: costCenters.name,
      kind: costCenters.kind,
      projectId: costCenters.projectId,
      projectCost: sql<string>`coalesce((select sum(pce.amount) from project_cost_entries pce where pce.project_id = "cost_centers"."project_id"), 0)`,
      payables: sql<string>`coalesce((select sum(ap.amount) from accounts_payable ap where ap.cost_center_id = "cost_centers"."id" and not ap.cancelled), 0)`,
    })
    .from(costCenters)
    .where(eq(costCenters.companyId, user.companyId))
    .orderBy(costCenters.code);
  const finInsights = snap.insights.filter((i) => i.area === "financeiro");
  const recent = cash.projection.days.slice(0, 31);

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Caixa, recebíveis, pagamentos e previsões em um só lugar."
        actions={
          <>
            <LinkButton href="/financeiro/receber" variant="secondary">
              Contas a receber
            </LinkButton>
            <LinkButton href="/financeiro/pagar" variant="secondary">
              Contas a pagar
            </LinkButton>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Saldo em contas" value={moneyShort(cash.balances.total)} hint={cash.balances.accounts.map((a) => `${a.name} ${moneyShort(a.balance)}`).join("; ")} />
        <Kpi label="A receber vencido" value={moneyShort(snap.ctx.overdueReceivables)} tone={snap.ctx.overdueReceivables ? "negative" : "default"} href="/financeiro/receber?status=vencido" />
        <Kpi label="Recebimentos em 7 dias" value={moneyShort(snap.ctx.receivablesNext7)} href="/financeiro/receber" />
        <Kpi label="Pagamentos em 7 dias" value={moneyShort(snap.ctx.payablesNext7)} href="/financeiro/pagar" />
        <Kpi label="Saldo projetado em 30 dias" value={moneyShort(proj30.balance)} tone={proj30.balance < 0 ? "negative" : "info"} href="/financeiro/fluxo-de-caixa" />
        <Kpi label="Inadimplência" value={pct(delinquency)} hint="Vencido em aberto ÷ total já vencido" tone={(delinquency ?? 0) > 10 ? "negative" : "default"} />
      </div>
      <div className="mb-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Próximos 30 dias" actions={<LinkButton href="/financeiro/fluxo-de-caixa" variant="ghost" size="sm">Abrir fluxo de caixa</LinkButton>} />
          <div className="p-4">
            <CashflowChart data={recent.map((d) => ({ ...d, label: shortDate(d.date) }))} height={260} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Alertas financeiros" />
          <InsightList insights={finInsights} empty="Nenhum alerta financeiro." />
        </Card>
      </div>
      <Card>
        <CardHeader title="Centros de custo" description="Cada obra ganha um centro de custo automaticamente ao ser criada." />
        <Table>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Centro de custo</Th>
              <Th>Tipo</Th>
              <Th align="right">Custos apropriados</Th>
            </tr>
          </thead>
          <tbody>
            {centers.map((c) => (
              <tr key={c.id}>
                <Td className="tabular">{c.code}</Td>
                <Td>{c.projectId ? <Link href={`/obras/${c.projectId}?tab=financeiro`} className="hover:text-primary">{c.name}</Link> : c.name}</Td>
                <Td className="capitalize">{c.kind}</Td>
                <Td align="right">{money(c.projectId ? Number(c.projectCost) : Number(c.payables))}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
