import type { Metadata } from "next";
import { createPayableAction, payAction } from "../actions";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input, MoneyInput, Select } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, EmptyState, Kpi, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { todayISO } from "@/domain/dates";
import { date, money, moneyShort } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { savedFiltersFor } from "@/server/services/filters";
import { listPayables, PAYABLE_STATUS } from "@/server/services/finance-lists";
import { financeOptions, PAYMENT_METHODS } from "@/server/services/options";

export const metadata: Metadata = { title: "Contas a pagar" };

export default async function PagarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("finance:view");
  const f = await searchParams;
  const [{ items, totals }, opts, saved] = await Promise.all([listPayables(user.companyId, f), financeOptions(user.companyId), savedFiltersFor(user.id, "/financeiro/pagar")]);
  const today = todayISO();
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Contas a pagar"
        description="Despesas vinculadas a uma obra entram automaticamente no custo dela. Valores acima da alçada aguardam aprovação."
        actions={
          <>
            <LinkButton href={`/api/export/pagar?${qs}`} variant="secondary" prefetch={false}>
              Exportar Excel/CSV
            </LinkButton>
            {can(user, "finance:edit") && (
              <FormModal trigger="Nova conta a pagar" title="Nova conta a pagar" action={createPayableAction} wide>
                <Input name="description" label="Descrição" required />
                <div className="grid gap-3 md:grid-cols-2">
                  <Select name="categoryId" label="Categoria" required placeholder="Selecione" options={opts.expenseCategories} />
                  <Select name="projectId" label="Obra (centro de custo)" placeholder="Administrativo (sem obra)" options={opts.projects} />
                  <Select name="supplierId" label="Fornecedor" placeholder="—" options={opts.suppliers} />
                  <Select name="employeeId" label="Funcionário" placeholder="—" options={opts.employees} />
                  <Input name="documentNumber" label="Nº documento / NF" />
                  <Input name="competenceDate" type="date" label="Competência" defaultValue={today} />
                </div>
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
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Em aberto" value={moneyShort(totals.open)} />
        <Kpi label="Vencido" value={moneyShort(totals.overdue)} tone={totals.overdue ? "negative" : "default"} href="/financeiro/pagar?status=vencido" />
        <Kpi label="Aguardando aprovação" value={moneyShort(totals.pendingApproval)} href="/aprovacoes" />
        <Kpi label="Pago (lista)" value={moneyShort(totals.paid)} />
      </div>
      <FilterBar
        saved={saved}
        fields={[
          { name: "q", label: "Buscar", type: "search", placeholder: "Fornecedor ou descrição" },
          { name: "status", label: "Status", type: "select", options: Object.entries(PAYABLE_STATUS).map(([v, s]) => ({ value: v, label: s.label })) },
          { name: "categoria", label: "Categoria", type: "select", options: opts.expenseCategories },
          { name: "obra", label: "Obra", type: "select", options: opts.projects },
          { name: "de", label: "Vencimento de", type: "date" },
          { name: "ate", label: "até", type: "date" },
        ]}
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="Nenhuma conta encontrada" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Vencimento</Th>
                <Th>Favorecido</Th>
                <Th>Descrição</Th>
                <Th>Categoria / obra</Th>
                <Th align="right">Valor</Th>
                <Th align="right">Em aberto</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className={p.status === "vencido" ? "bg-danger-soft/30" : ""}>
                  <Td className="whitespace-nowrap tabular">{date(p.dueDate)}</Td>
                  <Td>{p.supplierName ?? p.employeeName ?? "—"}</Td>
                  <Td>
                    {p.description}
                    {p.documentNumber && <p className="text-[12px] text-muted">{p.documentNumber}</p>}
                  </Td>
                  <Td className="text-[13px]">
                    {p.categoryName}
                    {p.projectCode && <p className="text-[12px] text-muted">{p.projectCode}</p>}
                  </Td>
                  <Td align="right">{money(p.amount)}</Td>
                  <Td align="right" className="font-medium">
                    {money(p.open)}
                  </Td>
                  <Td>
                    <Badge tone={PAYABLE_STATUS[p.status].tone}>{PAYABLE_STATUS[p.status].label}</Badge>
                  </Td>
                  <Td>
                    {can(user, "finance:settle") && p.open > 0 && p.status !== "pendente_aprovacao" && p.status !== "cancelado" && (
                      <FormModal trigger="Pagar" title="Registrar pagamento" description={p.description} action={payAction} size="sm" variant="secondary" submitLabel="Confirmar pagamento">
                        <input type="hidden" name="id" value={p.id} />
                        <div className="grid grid-cols-2 gap-3">
                          <MoneyInput name="amount" label="Valor pago" defaultValue={p.open.toFixed(2).replace(".", ",")} required />
                          <Input name="date" type="date" label="Data" defaultValue={today} max={today} required />
                          <Select name="bankAccountId" label="Conta" options={opts.banks} required />
                          <Select name="method" label="Forma" options={PAYMENT_METHODS} defaultValue="pix" />
                        </div>
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
