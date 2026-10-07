import { nowLocalInput } from "@/domain/dates";
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { createLeadAction, createVisitAction } from "../actions";
import { HorizontalBars } from "@/components/charts/charts";
import { Checkbox, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardHeader, Kpi, LinkButton, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { date, money0, moneyShort, pct } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { contracts } from "@/server/db/schema";
import { crmBoard, crmIndicators, LEAD_SOURCES, LEAD_STAGES } from "@/server/services/commercial";
import { financeOptions } from "@/server/services/options";
import { LeadMove } from "./lead-move";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
  const user = await requireUser("crm:view");
  const [list, contractRows, opts] = await Promise.all([
    crmBoard(user.companyId),
    db.select({ v: contracts.value }).from(contracts).where(and(eq(contracts.companyId, user.companyId))),
    financeOptions(user.companyId),
  ]);
  const ind = crmIndicators(list, contractRows.map((c) => c.v));
  const editable = can(user, "crm:edit");
  const nowLocal = nowLocalInput();

  return (
    <>
      <PageHeader
        title="Funil comercial"
        description="Do primeiro contato ao contrato. Ao aprovar o orçamento, contrato e obra são criados automaticamente."
        actions={
          editable && (
            <>
              <LinkButton href="/comercial/visitas" variant="secondary">
                Visitas técnicas
              </LinkButton>
              <FormModal trigger="Novo lead" title="Novo lead" action={createLeadAction}>
                <Input name="name" label="Nome / empresa" required />
                <div className="grid grid-cols-2 gap-3">
                  <Input name="phone" label="Telefone/WhatsApp" inputMode="tel" />
                  <Input name="email" label="E-mail" type="email" />
                  <Input name="city" label="Cidade" />
                  <Select name="source" label="Origem" options={LEAD_SOURCES.map(([v, l]) => ({ value: v, label: l }))} defaultValue="whatsapp" />
                  <MoneyInput name="estimatedValue" label="Valor estimado" />
                  <Select name="clientId" label="Cliente existente" placeholder="Novo cliente" options={opts.clients} />
                </div>
                <Textarea name="description" label="O que o cliente precisa" />
              </FormModal>
            </>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Leads" value={ind.total} hint={`${ind.open} em aberto`} />
        <Kpi label="Valor em negociação" value={moneyShort(ind.pipeline)} />
        <Kpi label="Taxa de conversão" value={pct(ind.conversion, 0)} hint="Fechados ÷ decididos" />
        <Kpi label="Ticket médio" value={moneyShort(ind.ticket)} hint="Por contrato" />
        <Kpi label="Perdidos" value={ind.lostReasons.reduce((s, r) => s + r.count, 0)} />
      </div>

      <div className="relative -mx-4 mb-8 overflow-x-auto px-4 md:-mx-6 md:px-6">
        <div className="grid min-w-[1400px] grid-cols-9 gap-3">
          {LEAD_STAGES.map(([stage, label]) => {
            const items = list.filter((l) => l.stage === stage);
            const total = items.reduce((s, l) => s + (l.estimatedValue ?? 0), 0);
            return (
              <section key={stage} className={cn("flex min-h-60 flex-col rounded-xl border border-border bg-surface-2", stage === "fechado" && "border-success/40", stage === "perdido" && "opacity-80")}>
                <header className="border-b border-border px-3 py-2.5">
                  <p className="text-[13px] font-semibold">{label}</p>
                  <p className="text-[12px] text-muted">
                    {items.length} | {moneyShort(total)}
                  </p>
                </header>
                <ul className="flex-1 space-y-2 p-2">
                  {items.map((l) => (
                    <li key={l.id} className="rounded-lg border border-border bg-surface p-2.5 text-[13px] shadow-[0_1px_0_rgb(14_42_59/0.04)]">
                      <p className="font-medium leading-snug">{l.name}</p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {[l.city, LEAD_SOURCES.find((s) => s[0] === l.source)?.[1]].filter(Boolean).join(", ")}
                      </p>
                      {l.estimatedValue ? <p className="mt-1 font-medium tabular">{money0(l.estimatedValue)}</p> : null}
                      {l.lostReason && <Badge tone="red" className="mt-1">{l.lostReason}</Badge>}
                      <p className="mt-1 text-[11px] text-muted">
                        {l.seller ?? "—"}, {date(l.createdAt)}
                      </p>
                      {editable && <LeadMove id={l.id} stage={l.stage} stages={LEAD_STAGES.map((s) => [s[0], s[1]])} />}
                      {editable && (l.stage === "contato" || l.stage === "lead") && (
                        <div className="mt-1.5">
                          <FormModal trigger="Agendar visita" title={`Visita técnica: ${l.name}`} action={createVisitAction} variant="ghost" size="sm">
                            <input type="hidden" name="leadId" value={l.id} />
                            <input type="hidden" name="clientId" value={l.clientId ?? ""} />
                            <Input name="scheduledAt" type="datetime-local" label="Data e hora" defaultValue={nowLocal} required />
                            <Input name="address" label="Endereço" />
                            <Textarea name="reportedProblem" label="Problema relatado" defaultValue={l.description ?? ""} />
                            <Checkbox name="done" label="Visita já realizada" />
                          </FormModal>
                        </div>
                      )}
                      {editable && ["visita_realizada", "orcamento", "negociacao"].includes(l.stage) && (
                        <LinkButton href={`/comercial/orcamentos/novo?lead=${l.id}${l.clientId ? `&cliente=${l.clientId}` : ""}`} variant="ghost" size="sm" className="mt-1.5 h-7 px-2 text-[12px]">
                          Criar orçamento
                        </LinkButton>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Leads por origem" />
          <div className="p-3">
            <HorizontalBars data={ind.bySource.map((s) => ({ label: s.label, value: s.count }))} valueLabel="Leads" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Vendas por vendedor" />
          <div className="p-3">
            <HorizontalBars data={ind.bySeller.map((s) => ({ label: s.label, value: s.count }))} valueLabel="Fechados" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Motivos de perda" />
          <div className="p-3">
            <HorizontalBars data={ind.lostReasons.map((s) => ({ label: s.label, value: s.count }))} valueLabel="Leads" />
          </div>
        </Card>
      </div>
    </>
  );
}
