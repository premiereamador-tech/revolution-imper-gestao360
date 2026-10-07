import { additionAction, updateBudgetAction } from "../../actions";
import { Input, MoneyInput, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardBody, CardHeader, LinkButton, Table, Td, Th } from "@/components/ui/primitives";
import { Waterline } from "@/components/ui/waterline";
import { COST_CATEGORIES, COST_CATEGORY_LABEL } from "@/domain/project-finance";
import { receivableStatus } from "@/domain/receivables";
import { todayISO } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { date, money, money0, pct } from "@/lib/format";
import { can } from "@/server/auth/session";
import { RECEIVABLE_STATUS } from "@/server/services/finance-lists";
import { projectAdditions, projectFinanceDetail } from "@/server/services/project-detail";
import type { TabProps } from "./types";

export async function FinanceTab({ user, core, summary }: TabProps) {
  const f = summary.finance;
  const [detail, additions] = await Promise.all([projectFinanceDetail(core.p.id), projectAdditions(core.p.contractId)]);
  const today = todayISO();
  const editable = can(user, "projects:edit");
  const budgetMap = Object.fromEntries(detail.budgets.map((b) => [b.category, b.amount]));

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <Waterline finance={f} />
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader title="Resultado da obra" description="Contrato + aditivos − custos = lucro" />
          <CardBody className="p-0">
            <table className="w-full text-sm">
              <tbody>
                <Row label="Valor do contrato" value={summary.contractValue} />
                <Row label="+ Aditivos aprovados" value={summary.approvedAdditions} />
                <Row label="= Receita total" value={f.revenue} strong />
                {f.lines.map((l) => (
                  <Row key={l.category} label={`− ${COST_CATEGORY_LABEL[l.category]}`} value={-l.projected} hint={`gasto ${money0(l.incurred)}`} />
                ))}
                <Row label="= Lucro projetado da obra" value={f.projectedProfit} strong tone={f.isLosingMoney ? "neg" : "pos"} />
                <tr>
                  <td className="px-5 py-3 text-muted">Margem projetada</td>
                  <td className={cn("font-display px-5 py-3 text-right text-2xl font-semibold tabular", f.isLosingMoney ? "text-danger" : "text-success")}>{pct(f.projectedMargin, 2)}</td>
                </tr>
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Previsto × realizado por categoria"
            description="Alerta quando o gasto avança mais rápido que a obra."
            actions={
              editable && (
                <FormModal trigger="Editar orçamento de custos" title="Orçamento de custos da obra" action={updateBudgetAction} variant="secondary" size="sm">
                  <input type="hidden" name="projectId" value={core.p.id} />
                  <div className="grid grid-cols-2 gap-3">
                    {COST_CATEGORIES.map((c) => (
                      <MoneyInput key={c} name={`budget_${c}`} label={COST_CATEGORY_LABEL[c]} defaultValue={budgetMap[c] ? String(budgetMap[c]).replace(".", ",") : ""} />
                    ))}
                  </div>
                </FormModal>
              )
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Categoria</Th>
                <Th align="right">Orçado</Th>
                <Th align="right">Gasto</Th>
                <Th align="right">Consumido</Th>
                <Th align="right">Projetado</Th>
              </tr>
            </thead>
            <tbody>
              {f.lines.map((l) => (
                <tr key={l.category} className={l.overrunAlert ? "bg-danger-soft/40" : ""}>
                  <Td>
                    {COST_CATEGORY_LABEL[l.category]}
                    {l.overrunAlert && <Badge tone="red" className="ml-2">Alerta de estouro</Badge>}
                  </Td>
                  <Td align="right">{money0(l.budget)}</Td>
                  <Td align="right">{money0(l.incurred)}</Td>
                  <Td align="right" className={l.overrunAlert ? "font-medium text-danger" : ""}>
                    {pct(l.consumedPct, 0)}
                  </Td>
                  <Td align="right">{money0(l.projected)}</Td>
                </tr>
              ))}
              <tr className="font-medium">
                <Td>Total</Td>
                <Td align="right">{money0(f.budgetCost)}</Td>
                <Td align="right">{money0(f.incurredCost)}</Td>
                <Td align="right">{pct(f.budgetCost ? (f.incurredCost / f.budgetCost) * 100 : null, 0)}</Td>
                <Td align="right">{money0(f.projectedCost)}</Td>
              </tr>
            </tbody>
          </Table>
          <p className="px-5 py-3 text-[12px] text-muted">
            Obra {pct(summary.physicalProgress * 100, 0)} executada. Margem planejada {pct(f.plannedMargin)}, realizada até hoje {pct(f.realizedMargin)}, projetada {pct(f.projectedMargin)}.
          </p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Recebimentos da obra" description={`Faturado ${money0(f.invoiced)}, recebido ${money0(f.received)}`} actions={<LinkButton href={`/financeiro/receber?obra=${core.p.id}`} variant="ghost" size="sm">Abrir no financeiro</LinkButton>} />
          <Table>
            <thead>
              <tr>
                <Th>Vencimento</Th>
                <Th>Descrição</Th>
                <Th align="right">Valor</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {detail.receivables.map((r) => {
                const st = receivableStatus(r, today);
                return (
                  <tr key={r.id}>
                    <Td className="tabular">{date(r.dueDate)}</Td>
                    <Td>{r.description}</Td>
                    <Td align="right">{money(r.amount)}</Td>
                    <Td>
                      <Badge tone={RECEIVABLE_STATUS[st].tone}>{RECEIVABLE_STATUS[st].label}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Aditivos de contrato"
            description="Histórico do contrato original + aditivos"
            actions={
              editable && (
                <FormModal trigger="Novo aditivo" title="Novo aditivo" description="Aditivos passam pela alçada de aprovação configurada." action={additionAction} size="sm">
                  <input type="hidden" name="projectId" value={core.p.id} />
                  <Textarea name="description" label="Serviço extra" required />
                  <div className="grid grid-cols-3 gap-3">
                    <Input name="quantity" label="Quantidade" inputMode="decimal" />
                    <Input name="unit" label="Unidade" defaultValue="m²" />
                    <Input name="extraDays" label="Dias a mais" type="number" min={0} defaultValue="0" />
                  </div>
                  <MoneyInput name="value" label="Valor do aditivo" required />
                </FormModal>
              )
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Nº</Th>
                <Th>Descrição</Th>
                <Th align="right">Valor</Th>
                <Th align="right">Prazo</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>—</Td>
                <Td>Contrato original {core.contract?.number}</Td>
                <Td align="right">{money(summary.contractValue)}</Td>
                <Td align="right">{core.p.contractDays ?? "—"} d</Td>
                <Td>
                  <Badge tone="blue">Original</Badge>
                </Td>
              </tr>
              {additions.map((a) => (
                <tr key={a.id}>
                  <Td>{a.number}</Td>
                  <Td>{a.description}</Td>
                  <Td align="right">{money(a.value)}</Td>
                  <Td align="right">+{a.extraDays} d</Td>
                  <Td>
                    <Badge tone={a.status === "aprovado" ? "green" : a.status === "reprovado" ? "red" : "amber"}>{a.status}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader title="Lançamentos de custo" description="Gerados automaticamente por consumo de material, ponto e contas a pagar da obra (últimos 25)." />
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Categoria</Th>
              <Th>Descrição</Th>
              <Th>Origem</Th>
              <Th align="right">Valor</Th>
            </tr>
          </thead>
          <tbody>
            {detail.entries.map((e) => (
              <tr key={e.id}>
                <Td className="tabular">{date(e.date)}</Td>
                <Td>{COST_CATEGORY_LABEL[e.category]}</Td>
                <Td>{e.description}</Td>
                <Td className="text-muted">{{ stock: "Estoque", timesheet: "Ponto", payable: "Conta a pagar", manual: "Manual" }[e.source] ?? e.source}</Td>
                <Td align="right">{money(e.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function Row({ label, value, strong, tone, hint }: { label: string; value: number; strong?: boolean; tone?: "neg" | "pos"; hint?: string }) {
  return (
    <tr className={cn("border-b border-border/70", strong && "bg-surface-2")}>
      <td className={cn("px-5 py-2.5", strong ? "font-semibold" : "text-text")}>
        {label}
        {hint && <span className="ml-2 text-[12px] text-muted">{hint}</span>}
      </td>
      <td className={cn("px-5 py-2.5 text-right tabular", strong && "font-semibold", tone === "neg" && "text-danger", tone === "pos" && "text-success")}>{money(value)}</td>
    </tr>
  );
}
