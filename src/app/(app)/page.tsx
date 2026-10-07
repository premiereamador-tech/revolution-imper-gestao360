import type { Metadata } from "next";
import { MonthlyFinanceChart } from "@/components/charts/charts";
import { InsightList } from "@/components/domain/insight-list";
import { ProjectTable } from "@/components/domain/project-table";
import { Card, CardHeader, Kpi, LinkButton, PageHeader } from "@/components/ui/primitives";
import { topProblems } from "@/domain/insights";
import { money0, moneyShort, pct } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { loadExecutiveDashboard } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default async function DashboardPage() {
  const user = await requireUser("dashboard:view");
  const d = await loadExecutiveDashboard(user.companyId);
  const showFinance = can(user, "finance:view");
  const k = d.kpi;
  const monthName = new Date(`${d.today}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const ongoing = d.snap.summaries.filter((p) => p.statusCategory === "ativa" || p.statusCategory === "pausada" || p.statusCategory === "pre_obra");

  return (
    <>
      <PageHeader
        title="Dashboard executivo"
        description={`Situação da Revolution Imper em ${monthName}.`}
        actions={
          can(user, "owner:view") && (
            <LinkButton href="/central-do-dono" variant="secondary">
              Abrir Central do Dono
            </LinkButton>
          )
        }
      />

      {showFinance && (
        <section aria-labelledby="dinheiro" className="mb-8">
          <h2 id="dinheiro" className="mb-3 text-sm font-semibold text-muted">
            Dinheiro
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-7">
            <Kpi label="Caixa hoje" value={moneyShort(d.cash.balance)} href="/financeiro" />
            <Kpi label="Saldo projetado em 30 dias" value={moneyShort(d.cash.projected30)} tone={d.cash.projected30 < 0 ? "negative" : "default"} href="/financeiro/fluxo-de-caixa" />
            <Kpi label="Faturamento do mês" value={moneyShort(d.totals.invoiced)} tone="info" />
            <Kpi label="Recebido no mês" value={moneyShort(d.totals.received)} />
            <Kpi label="Contas a receber" value={moneyShort(d.totals.openReceivables)} href="/financeiro/receber" />
            <Kpi label="Vencidas a receber" value={moneyShort(k.overdueReceivables)} tone={k.overdueReceivables > 0 ? "negative" : "default"} href="/financeiro/receber?status=vencido" />
            <Kpi label="Contas a pagar" value={moneyShort(d.totals.openPayables)} href="/financeiro/pagar" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-6">
            <Kpi label="Despesas do mês" value={moneyShort(d.totals.expenses)} />
            <Kpi label="Lucro bruto do mês" value={moneyShort(k.grossProfit)} tone={k.grossProfit < 0 ? "negative" : "positive"} hint="Faturado menos custos diretos" />
            <Kpi label="Lucro líquido do mês" value={moneyShort(k.netProfit)} tone={k.netProfit < 0 ? "negative" : "positive"} href="/financeiro/dre" />
            <Kpi label="Margem média projetada" value={pct(k.averageMargin)} hint="Obras em andamento" />
            <Kpi label="Ticket médio por obra" value={moneyShort(k.ticket)} />
            <Kpi label="Valor em estoque" value={moneyShort(k.stockValue)} href="/suprimentos/estoque" />
          </div>
        </section>
      )}

      <section aria-labelledby="obras" className="mb-8">
        <h2 id="obras" className="mb-3 text-sm font-semibold text-muted">
          Obras e vendas
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-7">
          <Kpi label="Obras ativas" value={k.activeProjects} href="/obras?grupo=ativas" />
          <Kpi label="Obras atrasadas" value={k.lateProjects} tone={k.lateProjects ? "negative" : "default"} href="/obras?grupo=atrasadas" />
          <Kpi label="Concluídas no mês" value={k.concludedThisMonth} />
          <Kpi label="Novos contratos no mês" value={k.newContracts} hint={money0(k.newContractsValue)} />
          {showFinance && <Kpi label="Valor contratado" value={moneyShort(k.contractedValue)} hint="Contratos + aditivos" />}
          {showFinance && <Kpi label="Valor já executado" value={moneyShort(k.executedValue)} hint="Pelo avanço físico" />}
          {showFinance && <Kpi label="Ainda a receber das obras" value={moneyShort(k.toReceiveValue)} hint={`Recebido: ${moneyShort(k.receivedValue)}`} />}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-6">
          <Kpi label="Funcionários ativos" value={k.activeEmployees} href="/equipe/funcionarios" />
          {showFinance && <Kpi label="Custo de mão de obra no mês" value={moneyShort(k.laborCost)} />}
          {showFinance && <Kpi label="Custo com fornecedores no mês" value={moneyShort(k.suppliersCost)} />}
          {showFinance && <Kpi label="Materiais consumidos no mês" value={moneyShort(k.materialsCost)} />}
          <Kpi label="Conversão comercial" value={pct(k.conversion, 0)} hint="Leads fechados ÷ decididos" href="/comercial/leads" />
          <Kpi label="Propostas aguardando cliente" value={k.pendingQuotes} href="/comercial/orcamentos" />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {showFinance && (
          <Card>
            <CardHeader title="Faturado, recebido e pago" description="Últimos 6 meses" />
            <div className="p-4">
              <MonthlyFinanceChart data={d.series.map((s) => ({ ...s, label: `${MONTHS[Number(s.month.slice(5)) - 1]}/${s.month.slice(2, 4)}` }))} />
            </div>
          </Card>
        )}
        <Card className={showFinance ? "" : "xl:col-span-2"}>
          <CardHeader title="Precisa de atenção" actions={<LinkButton href="/alertas" variant="ghost" size="sm">Ver todos os alertas</LinkButton>} />
          <InsightList insights={topProblems(d.snap.insights, 6)} />
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Obras em andamento e a iniciar" description="Clique no semáforo para ver o motivo da classificação." actions={<LinkButton href="/obras" variant="ghost" size="sm">Todas as obras</LinkButton>} />
        <ProjectTable projects={ongoing} showFinance={can(user, "projects:finance")} />
      </Card>
    </>
  );
}
