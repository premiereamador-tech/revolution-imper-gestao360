import { approveMeasurementAction, createMeasurementAction, invoiceMeasurementAction } from "../../actions";
import { Input, Textarea } from "@/components/ui/form";
import { FormModal, InlineActionButton } from "@/components/ui/form-modal";
import { Badge, Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { MEASUREMENT_FLOW } from "@/domain/measurement";
import { addDays, startOfMonth, todayISO } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { date, money, number, pct } from "@/lib/format";
import { can } from "@/server/auth/session";
import { projectAreasWithApps, projectMeasurements } from "@/server/services/project-detail";
import type { TabProps } from "./types";

const STATUS_LABEL: Record<string, string> = { prevista: "Prevista", executada: "Executada", aprovada: "Aprovada", faturada: "Faturada", recebida: "Recebida" };
const STATUS_TONE: Record<string, string> = { prevista: "slate", executada: "amber", aprovada: "blue", faturada: "violet", recebida: "green" };

export async function MeasurementsTab({ user, core, summary }: TabProps) {
  const [ms, areas] = await Promise.all([projectMeasurements(core.p.id), projectAreasWithApps(core.p.id)]);
  const measuredByArea = new Map<string, number>();
  for (const m of ms) for (const i of m.items) if (i.areaId) measuredByArea.set(i.areaId, (measuredByArea.get(i.areaId) ?? 0) + i.currentQuantity);
  const unitPrice = summary.contractedArea ? summary.finance.revenue / summary.contractedArea : 0;
  const today = todayISO();
  const fin = can(user, "projects:finance");
  const totals = Object.fromEntries(MEASUREMENT_FLOW.map((s) => [s, ms.filter((m) => m.status === s).reduce((a, m) => a + m.netValue, 0)]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border md:grid-cols-5">
        {MEASUREMENT_FLOW.map((s, i) => (
          <div key={s} className="bg-surface px-4 py-3">
            <p className="text-[12px] text-muted">
              {i + 1}. {STATUS_LABEL[s]}
            </p>
            <p className="font-display mt-0.5 text-xl font-semibold tabular">{fin ? money(totals[s]) : ms.filter((m) => m.status === s).length}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader
          title="Medições"
          description={`Retenção contratual de ${pct(core.p.retentionRate, 0)}. Medição faturada gera conta a receber automaticamente.`}
          actions={
            can(user, "measurements:edit") && (
              <FormModal trigger="Nova medição" title="Nova medição" description="Informe a quantidade executada no período por área." action={createMeasurementAction} wide size="sm">
                <input type="hidden" name="projectId" value={core.p.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Input name="periodStart" type="date" label="Início do período" defaultValue={startOfMonth(today)} required />
                  <Input name="periodEnd" type="date" label="Fim do período" defaultValue={today} required />
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-[12px] text-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Área</th>
                        <th className="px-3 py-2 text-right font-medium">Contratado</th>
                        <th className="px-3 py-2 text-right font-medium">Já medido</th>
                        <th className="px-3 py-2 text-right font-medium">Executado</th>
                        <th className="px-3 py-2 text-right font-medium">Medir agora (m²)</th>
                        <th className="px-3 py-2 text-right font-medium">Preço/m²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {areas.map((a) => {
                        const already = measuredByArea.get(a.id) ?? 0;
                        const suggestion = Math.max(Math.min(a.executedArea, a.contractedArea) - already, 0);
                        return (
                          <tr key={a.id} className="border-t border-border">
                            <td className="px-3 py-2">{a.name}</td>
                            <td className="px-3 py-2 text-right tabular">{number(a.contractedArea)}</td>
                            <td className="px-3 py-2 text-right tabular">{number(already)}</td>
                            <td className="px-3 py-2 text-right tabular">{number(a.executedArea)}</td>
                            <td className="px-3 py-2">
                              <input name={`qty_${a.id}`} inputMode="decimal" defaultValue={suggestion ? String(Math.round(suggestion * 100) / 100).replace(".", ",") : ""} className="h-9 w-28 rounded-md border border-border px-2 text-right tabular" aria-label={`Medir ${a.name}`} />
                            </td>
                            <td className="px-3 py-2">
                              <input name={`price_${a.id}`} inputMode="decimal" defaultValue={unitPrice.toFixed(2).replace(".", ",")} className="h-9 w-28 rounded-md border border-border px-2 text-right tabular" aria-label={`Preço ${a.name}`} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[12px] text-muted">A sugestão é o executado no diário ainda não medido. O sistema bloqueia medição acima do contratado.</p>
                <Textarea name="notes" label="Observações" rows={2} />
              </FormModal>
            )
          }
        />
        {ms.length === 0 ? (
          <EmptyState title="Nenhuma medição" description="Obras com pagamento por medição geram as cobranças a partir daqui." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nº</Th>
                <Th>Período</Th>
                <Th>Serviços</Th>
                <Th align="right">Bruto</Th>
                <Th align="right">Retenção</Th>
                <Th align="right">Líquido</Th>
                <Th>Status</Th>
                <Th className="w-56" />
              </tr>
            </thead>
            <tbody>
              {ms.map((m) => (
                <tr key={m.id}>
                  <Td className="font-medium">{m.number}</Td>
                  <Td className="whitespace-nowrap tabular">
                    {date(m.periodStart)} a {date(m.periodEnd)}
                  </Td>
                  <Td className="text-[13px]">
                    {m.items.map((i) => (
                      <p key={i.id}>
                        {i.service}: {number(i.currentQuantity)} {i.unit} (acum. {pct(((i.previousQuantity + i.currentQuantity) / i.contractedQuantity) * 100, 0)})
                      </p>
                    ))}
                  </Td>
                  <Td align="right">{money(m.grossValue)}</Td>
                  <Td align="right">{money(m.retentionValue)}</Td>
                  <Td align="right" className="font-medium">
                    {money(m.netValue)}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                    {m.dueDate && <p className={cn("mt-0.5 text-[11px]", m.status === "faturada" && m.dueDate < today ? "text-danger" : "text-muted")}>venc. {date(m.dueDate)}</p>}
                  </Td>
                  <Td>
                    {m.status === "executada" && can(user, "measurements:approve") && (
                      <InlineActionButton action={approveMeasurementAction} fields={{ measurementId: m.id, projectId: core.p.id }}>
                        Aprovar
                      </InlineActionButton>
                    )}
                    {m.status === "aprovada" && can(user, ["measurements:approve", "finance:edit"]) && (
                      <FormModal trigger="Faturar" title={`Faturar medição ${m.number}`} description={`Cria uma conta a receber de ${money(m.netValue)}.`} action={invoiceMeasurementAction} size="sm" submitLabel="Faturar">
                        <input type="hidden" name="measurementId" value={m.id} />
                        <input type="hidden" name="projectId" value={core.p.id} />
                        <Input name="dueDate" type="date" label="Vencimento" defaultValue={addDays(today, 15)} required />
                      </FormModal>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
