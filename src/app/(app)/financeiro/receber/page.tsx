import type { Metadata } from "next";
import Link from "next/link";
import { cancelReceivableAction, createReceivableAction, receiveAction } from "../actions";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input, MoneyInput, Select } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, EmptyState, Kpi, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { todayISO } from "@/domain/dates";
import { date, money, moneyShort } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { savedFiltersFor } from "@/server/services/filters";
import { listReceivables, RECEIVABLE_STATUS } from "@/server/services/finance-lists";
import { financeOptions, PAYMENT_METHODS } from "@/server/services/options";

export const metadata: Metadata = { title: "Contas a receber" };

export default async function ReceberPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("finance:view");
  const f = await searchParams;
  const [{ items, totals }, opts, saved] = await Promise.all([listReceivables(user.companyId, f), financeOptions(user.companyId), savedFiltersFor(user.id, "/financeiro/receber")]);
  const today = todayISO();
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const canSettle = can(user, "finance:settle");

  return (
    <>
      <PageHeader
        title="Contas a receber"
        description="Status calculado automaticamente pelo vencimento e pelos recebimentos."
        actions={
          <>
            <LinkButton href={`/api/export/receber?${qs}`} variant="secondary" prefetch={false}>
              Exportar Excel/CSV
            </LinkButton>
            {can(user, "finance:edit") && (
              <FormModal trigger="Nova conta a receber" title="Nova conta a receber" description="Para obras com medição, prefira faturar a medição na própria obra." action={createReceivableAction}>
                <Select name="clientId" label="Cliente" required placeholder="Selecione" options={opts.clients} />
                <Select name="projectId" label="Obra" placeholder="Sem obra" options={opts.projects} />
                <Input name="description" label="Descrição" required />
                <div className="grid grid-cols-3 gap-3">
                  <MoneyInput name="amount" label="Valor total" required />
                  <Input name="dueDate" type="date" label="1º vencimento" defaultValue={today} required />
                  <Input name="installments" type="number" min={1} max={48} label="Parcelas" defaultValue="1" />
                </div>
              </FormModal>
            )}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Em aberto (confirmado)" value={moneyShort(totals.open - totals.forecast)} />
        <Kpi label="Vencido" value={moneyShort(totals.overdue)} tone={totals.overdue ? "negative" : "default"} href="/financeiro/receber?status=vencido" />
        <Kpi label="A vencer" value={moneyShort(totals.dueSoon)} href="/financeiro/receber?status=a_vencer" />
        <Kpi label="Previsões de medição" value={moneyShort(totals.forecast)} hint="Viram título ao faturar" href="/financeiro/receber?status=previsto" />
        <Kpi label="Recebido (lista)" value={moneyShort(totals.received)} tone="positive" />
      </div>
      <FilterBar
        saved={saved}
        fields={[
          { name: "q", label: "Buscar", type: "search", placeholder: "Cliente ou descrição" },
          { name: "status", label: "Status", type: "select", options: Object.entries(RECEIVABLE_STATUS).map(([v, s]) => ({ value: v, label: s.label })) },
          { name: "obra", label: "Obra", type: "select", options: opts.projects },
          { name: "cliente", label: "Cliente", type: "select", options: opts.clients },
          { name: "de", label: "Vencimento de", type: "date" },
          { name: "ate", label: "até", type: "date" },
        ]}
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="Nenhum título encontrado" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Vencimento</Th>
                <Th>Cliente / obra</Th>
                <Th>Descrição</Th>
                <Th align="right">Valor</Th>
                <Th align="right">Recebido</Th>
                <Th align="right">Em aberto</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className={r.status === "vencido" ? "bg-danger-soft/30" : ""}>
                  <Td className="whitespace-nowrap tabular">
                    {date(r.dueDate)}
                    {r.status === "vencido" && <p className="text-[11px] text-danger">{Math.round((Date.parse(today) - Date.parse(r.dueDate)) / 86_400_000)} dias</p>}
                  </Td>
                  <Td className="min-w-48">
                    <p>{r.clientName}</p>
                    {r.projectId && (
                      <Link href={`/obras/${r.projectId}?tab=financeiro`} className="text-[12px] text-muted hover:text-primary">
                        {r.projectCode} {r.projectName}
                      </Link>
                    )}
                  </Td>
                  <Td>{r.description}</Td>
                  <Td align="right">{money(r.net)}</Td>
                  <Td align="right">{money(r.receivedAmount)}</Td>
                  <Td align="right" className="font-medium">
                    {money(r.open)}
                  </Td>
                  <Td>
                    <Badge tone={RECEIVABLE_STATUS[r.status].tone}>{RECEIVABLE_STATUS[r.status].label}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {canSettle && r.open > 0 && !r.forecast && (
                      <FormModal trigger="Receber" title="Registrar recebimento" description={`${r.clientName}: ${r.description}`} action={receiveAction} size="sm" variant="secondary" submitLabel="Confirmar recebimento">
                        <input type="hidden" name="id" value={r.id} />
                        <div className="grid grid-cols-2 gap-3">
                          <MoneyInput name="amount" label="Valor recebido" defaultValue={r.open.toFixed(2).replace(".", ",")} required />
                          <Input name="date" type="date" label="Data" defaultValue={today} max={today} required />
                          <MoneyInput name="interest" label="Juros/multa" defaultValue={r.interest ? String(r.interest).replace(".", ",") : ""} />
                          <MoneyInput name="discount" label="Desconto" defaultValue={r.discount ? String(r.discount).replace(".", ",") : ""} />
                          <Select name="bankAccountId" label="Conta" options={opts.banks} required />
                          <Select name="method" label="Forma" options={PAYMENT_METHODS} defaultValue="pix" />
                        </div>
                        <p className="text-[12px] text-muted">Juros e desconto alteram o valor devido antes da baixa. Valor menor que o saldo gera baixa parcial.</p>
                      </FormModal>
                    )}
                    {can(user, "finance:edit") && r.receivedAmount === 0 && r.status !== "cancelado" && (
                      <FormModal trigger="Cancelar" title="Cancelar título" action={cancelReceivableAction} size="sm" variant="ghost" submitLabel="Cancelar título">
                        <input type="hidden" name="id" value={r.id} />
                        <Input name="reason" label="Motivo (fica na auditoria)" required />
                      </FormModal>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
