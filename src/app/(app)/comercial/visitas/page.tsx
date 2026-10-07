import { nowLocalInput } from "@/domain/dates";
import type { Metadata } from "next";
import { asc, eq, and, sql } from "drizzle-orm";
import { createVisitAction } from "../actions";
import { GeoFields } from "@/components/domain/geo-fields";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { area, dateTime } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { leads } from "@/server/db/schema";
import { visitsList } from "@/server/services/commercial";
import { financeOptions } from "@/server/services/options";

export const metadata: Metadata = { title: "Visitas técnicas" };

export default async function VisitasPage() {
  const user = await requireUser("crm:view");
  const [visits, opts, openLeads] = await Promise.all([
    visitsList(user.companyId),
    financeOptions(user.companyId),
    db.select({ id: leads.id, name: leads.name }).from(leads).where(and(eq(leads.companyId, user.companyId), sql`${leads.stage} not in ('fechado','perdido')`)).orderBy(asc(leads.name)),
  ]);
  const nowLocal = nowLocalInput();
  return (
    <>
      <PageHeader
        back={{ href: "/comercial/leads", label: "Funil comercial" }}
        title="Visitas técnicas"
        description="Levantamento em campo pelo celular. Os dados viram base para o orçamento."
        actions={
          can(user, "crm:edit") && (
            <FormModal trigger="Registrar visita" title="Visita técnica" action={createVisitAction} wide>
              <div className="grid gap-3 md:grid-cols-2">
                <Select name="leadId" label="Lead" placeholder="—" options={openLeads.map((l) => ({ value: l.id, label: l.name }))} />
                <Select name="clientId" label="ou cliente" placeholder="—" options={opts.clients} />
                <Input name="scheduledAt" type="datetime-local" label="Data e hora" defaultValue={nowLocal} />
                <Input name="address" label="Local" />
              </div>
              <GeoFields />
              <Textarea name="reportedProblem" label="Problema relatado" />
              <div className="grid gap-3 md:grid-cols-2">
                <Input name="infiltrationType" label="Tipo de infiltração" placeholder="Ex.: laje de cobertura, umidade ascendente" />
                <Input name="approxArea" label="Área aproximada (m²)" inputMode="decimal" />
              </div>
              <Textarea name="probableCauses" label="Possíveis causas" rows={2} />
              <Textarea name="proposedSolution" label="Solução proposta" rows={2} />
              <Textarea name="suggestedMaterials" label="Materiais sugeridos" rows={2} />
              <Textarea name="notes" label="Observações" rows={2} />
              <Checkbox name="done" label="Visita realizada" defaultChecked />
            </FormModal>
          )
        }
      />
      <Card>
        <CardHeader title="Visitas" />
        {visits.length === 0 ? (
          <EmptyState title="Nenhuma visita registrada" />
        ) : (
          <ul className="divide-y divide-border">
            {visits.map(({ v, leadName, clientName, responsible }) => (
              <li key={v.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]">
                <div className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{clientName ?? leadName}</p>
                    <Badge tone={v.doneAt ? "green" : "blue"}>{v.doneAt ? "Realizada" : "Agendada"}</Badge>
                    {v.approxArea ? <span className="text-[12px] text-muted">{area(v.approxArea)}</span> : null}
                  </div>
                  <p className="text-[12px] text-muted">
                    {dateTime(v.scheduledAt)}, {v.address ?? "local não informado"}, {responsible ?? "—"}
                  </p>
                  {v.reportedProblem && <p className="mt-1">{v.reportedProblem}</p>}
                  {v.proposedSolution && <p className="mt-1 text-[13px] text-muted">Solução: {v.proposedSolution}</p>}
                </div>
                {can(user, "crm:edit") && v.doneAt && (
                  <LinkButton href={`/comercial/orcamentos/novo?visita=${v.id}${v.leadId ? `&lead=${v.leadId}` : ""}${v.clientId ? `&cliente=${v.clientId}` : ""}`} variant="secondary" size="sm">
                    Gerar orçamento
                  </LinkButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
