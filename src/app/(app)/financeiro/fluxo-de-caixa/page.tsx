import type { Metadata } from "next";
import Link from "next/link";
import { CashflowChart } from "@/components/charts/charts";
import { Card, CardHeader, Kpi, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { CASHFLOW_HORIZONS, projectCashflow } from "@/domain/cashflow";
import { cn } from "@/lib/cn";
import { date, money, moneyShort, shortDate } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { loadCashflow } from "@/server/services/finance";

export const metadata: Metadata = { title: "Fluxo de caixa" };

export default async function FluxoPage({ searchParams }: { searchParams: Promise<{ h?: string; previsoes?: string }> }) {
  const user = await requireUser("finance:view");
  const { h = "30", previsoes = "sim" } = await searchParams;
  const horizon = CASHFLOW_HORIZONS.find((x) => x.key === h) ?? CASHFLOW_HORIZONS[3];
  const base = await loadCashflow(user.companyId, horizon.days);
  const items = previsoes === "nao" ? base.items.filter((i) => !i.forecast) : base.items;
  const p = projectCashflow(base.balances.total, items, base.today, horizon.days);

  // Agrupa o gráfico por semana quando o horizonte é longo
  const bucket = horizon.days > 90 ? 30 : horizon.days > 31 ? 7 : 1;
  const chart: Array<{ label: string; inflow: number; outflow: number; balance: number }> = [];
  for (let i = 0; i < p.days.length; i += bucket) {
    const slice = p.days.slice(i, i + bucket);
    chart.push({ label: shortDate(slice[0].date), inflow: slice.reduce((s, d) => s + d.inflow, 0), outflow: slice.reduce((s, d) => s + d.outflow, 0), balance: slice[slice.length - 1].balance });
  }
  const movementDays = p.days.filter((d) => d.inflow || d.outflow);

  return (
    <>
      <PageHeader title="Fluxo de caixa" description="Saldo de hoje nas contas + entradas previstas − saídas previstas. Títulos vencidos em aberto entram no dia de hoje." />
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
          {CASHFLOW_HORIZONS.map((x) => (
            <Link
              key={x.key}
              href={`/financeiro/fluxo-de-caixa?h=${x.key}&previsoes=${previsoes}`}
              className={cn("rounded-md px-3 py-1.5 text-sm", x.key === horizon.key ? "bg-primary text-white" : "text-muted hover:bg-surface-2")}
            >
              {x.label}
            </Link>
          ))}
        </div>
        <Link href={`/financeiro/fluxo-de-caixa?h=${horizon.key}&previsoes=${previsoes === "nao" ? "sim" : "nao"}`} className="rounded-lg px-3 py-2 text-sm text-primary hover:bg-primary-soft">
          {previsoes === "nao" ? "Incluir previsões de medição" : "Ver só títulos confirmados"}
        </Link>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Saldo inicial (hoje)" value={moneyShort(p.openingBalance)} hint={base.balances.accounts.map((a) => `${a.name}: ${moneyShort(a.balance)}`).join("; ")} />
        <Kpi label="Entradas previstas" value={moneyShort(p.totalIn)} tone="positive" />
        <Kpi label="Saídas previstas" value={moneyShort(p.totalOut)} tone="negative" />
        <Kpi label={`Saldo projetado (${horizon.label.toLowerCase()})`} value={moneyShort(p.closingBalance)} tone={p.closingBalance < 0 ? "negative" : "info"} />
        <Kpi label="Menor saldo no período" value={moneyShort(p.lowestBalance)} hint={`em ${date(p.lowestBalanceDate)}`} tone={p.lowestBalance < 0 ? "negative" : "default"} />
      </div>
      {p.firstNegativeDate && (
        <p className="mb-6 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          O caixa fica negativo em <strong>{date(p.firstNegativeDate)}</strong>. Antecipe recebimentos, renegocie vencimentos ou reforce o caixa antes dessa data.
        </p>
      )}
      <Card className="mb-6">
        <CardHeader title="Saldo projetado" description={bucket > 1 ? `Agrupado a cada ${bucket} dias.` : "Dia a dia."} />
        <div className="p-4">
          <CashflowChart data={chart} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Dias com movimento previsto" />
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th align="right">Entradas</Th>
              <Th align="right">Saídas</Th>
              <Th align="right">Saldo ao fim do dia</Th>
            </tr>
          </thead>
          <tbody>
            {movementDays.map((d) => (
              <tr key={d.date}>
                <Td className="tabular">{date(d.date)}</Td>
                <Td align="right" className="text-success">
                  {d.inflow ? money(d.inflow) : "—"}
                </Td>
                <Td align="right" className="text-danger">
                  {d.outflow ? money(d.outflow) : "—"}
                </Td>
                <Td align="right" className={cn("font-medium", d.balance < 0 && "text-danger")}>
                  {money(d.balance)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
