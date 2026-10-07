import { changeStatusAction } from "../../actions";
import { ActionForm, Select, SubmitButton } from "@/components/ui/form";
import { Card, CardBody, CardHeader, Field } from "@/components/ui/primitives";
import { Waterline } from "@/components/ui/waterline";
import { formatCEP, formatDocument, formatPhone } from "@/domain/br";
import { area, date, number, pct } from "@/lib/format";
import { can } from "@/server/auth/session";
import { projectFormOptions } from "@/server/services/projects";
import type { TabProps } from "./types";

export async function OverviewTab({ user, core, summary }: TabProps) {
  const p = core.p;
  const fc = summary.forecast;
  const opts = can(user, "projects:edit") ? await projectFormOptions(user.companyId) : null;
  const basis = { historico: "pelo ritmo das últimas 2 semanas", planejado: "pela meta diária planejada", sem_dados: "sem dados de produção ainda", concluida: "obra concluída" }[fc.basis];

  return (
    <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        {can(user, "projects:finance") && (
          <Card>
            <CardBody>
              <Waterline finance={summary.finance} />
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Previsão de término" description={`Calculada ${basis}.`} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Data contratual">{date(summary.adjustedPlannedEnd)}</Field>
              <Field label="Previsão atual">
                <span className={(fc.delayDays ?? 0) > 0 ? "font-semibold text-danger" : "font-semibold text-success"}>{date(fc.forecastEnd)}</span>
                {fc.delayDays !== null && fc.basis !== "concluida" && (
                  <span className="block text-[12px] text-muted">{fc.delayDays > 0 ? `${fc.delayDays} dias depois do contrato` : `${Math.abs(fc.delayDays)} dias de folga`}</span>
                )}
              </Field>
              <Field label="m² restantes">{area(fc.remainingArea)}</Field>
              <Field label="Ritmo considerado">{fc.dailyRate ? `${number(fc.dailyRate, 1)} m²/dia` : "—"}</Field>
              <Field label="Área contratada">{area(summary.contractedArea)}</Field>
              <Field label="Área executada">{area(summary.executedArea)}</Field>
              <Field label="Meta diária">{summary.dailyTargetArea ? `${number(summary.dailyTargetArea, 1)} m²/dia` : "—"}</Field>
              <Field label="Produtividade recente">
                {summary.recentDailyArea && summary.dailyTargetArea ? `${pct((summary.recentDailyArea / summary.dailyTargetArea) * 100, 0)} da meta` : "—"}
              </Field>
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Dados da obra" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Cliente" className="col-span-2">
                {core.client.name}
                <span className="block text-[12px] text-muted">{formatDocument(core.client.document)}</span>
              </Field>
              <Field label="Endereço" className="col-span-2">
                {[p.address, p.city && `${p.city}/${p.state ?? ""}`, p.zipCode && `CEP ${formatCEP(p.zipCode)}`].filter(Boolean).join(", ") || "—"}
              </Field>
              <Field label="Responsável do cliente">{p.clientContactName}</Field>
              <Field label="WhatsApp">
                {p.clientContactPhone ? (
                  <a className="text-primary hover:underline" href={`https://wa.me/55${p.clientContactPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                    {formatPhone(p.clientContactPhone)}
                  </a>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="E-mail" className="col-span-2">{p.clientContactEmail}</Field>
              <Field label="Engenheiro responsável">{core.engineer}</Field>
              <Field label="Encarregado">{core.foreman}</Field>
              <Field label="Contrato">{core.contract?.number}</Field>
              <Field label="Assinatura">{date(p.contractSignedAt)}</Field>
              <Field label="Início previsto">{date(p.plannedStart)}</Field>
              <Field label="Início real">{date(p.actualStart)}</Field>
              <Field label="Prazo contratado">{p.contractDays ? `${p.contractDays} dias` : "—"}</Field>
              <Field label="Término real">{date(p.actualEnd)}</Field>
              <Field label="Forma de pagamento">{p.paymentMethod}</Field>
              <Field label="Retenção">{pct(p.retentionRate, 0)}</Field>
              <Field label="Garantia">{p.warrantyMonths ? `${p.warrantyMonths} meses` : "—"}</Field>
            </dl>
            {p.notes && <p className="mt-4 rounded-lg bg-surface-2 p-3 text-sm text-text">{p.notes}</p>}
          </CardBody>
        </Card>

        {opts && (
          <Card>
            <CardHeader title="Alterar status" />
            <CardBody>
              <ActionForm action={changeStatusAction} className="flex items-end gap-2">
                <input type="hidden" name="projectId" value={p.id} />
                <Select name="statusKey" label="Novo status" defaultValue={summary.statusKey} options={opts.statusList.map((s) => ({ value: s.key, label: s.label }))} wrapClassName="flex-1" />
                <SubmitButton variant="secondary">Atualizar</SubmitButton>
              </ActionForm>
              <p className="mt-2 text-[12px] text-muted">Para entregar a obra e iniciar a garantia, use a aba Entrega e garantia.</p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
