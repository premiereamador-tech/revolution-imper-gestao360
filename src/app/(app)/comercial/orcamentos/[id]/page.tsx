import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { approveQuoteAction, duplicateQuoteAction, quoteStatusAction } from "../../actions";
import { Input, MoneyInput, Select } from "@/components/ui/form";
import { FormModal, InlineActionButton } from "@/components/ui/form-modal";
import { Badge, Card, CardBody, CardHeader, Field, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { addDays, todayISO } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { area, date, money, number, pct } from "@/lib/format";
import { QUOTE_STATUS } from "@/lib/labels";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { approvalRequests, clients, contracts, projects, quoteItems, quotes, waterproofingSystems } from "@/server/db/schema";
import { computeQuote } from "@/server/services/commercial";

export const metadata: Metadata = { title: "Orçamento" };

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("crm:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [row] = await db.select({ q: quotes, client: clients }).from(quotes).innerJoin(clients, eq(clients.id, quotes.clientId)).where(and(eq(quotes.id, id), eq(quotes.companyId, user.companyId))).limit(1);
  if (!row) notFound();
  const q = row.q;
  const [items, versions, systems, contract, pendingDiscount] = await Promise.all([
    db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.position)),
    db.select().from(quotes).where(and(eq(quotes.companyId, user.companyId), eq(quotes.number, q.number))).orderBy(desc(quotes.version)),
    db.select().from(waterproofingSystems).where(eq(waterproofingSystems.companyId, user.companyId)),
    db.select({ c: contracts, projectId: projects.id, projectCode: projects.code }).from(contracts).leftJoin(projects, eq(projects.contractId, contracts.id)).where(eq(contracts.quoteId, id)).limit(1),
    db.select().from(approvalRequests).where(and(eq(approvalRequests.entityId, id), eq(approvalRequests.status, "pendente"))).limit(1),
  ]);
  const t = computeQuote(q, items);
  const today = todayISO();
  const status = q.status === "enviado" && q.validUntil && q.validUntil < today ? "expirado" : q.status;
  const open = q.status === "rascunho" || q.status === "enviado";
  const edit = can(user, "crm:edit");

  return (
    <>
      <PageHeader
        back={{ href: "/comercial/orcamentos", label: "Orçamentos" }}
        title={q.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            Orçamento {q.number}, versão {q.version}, {row.client.name}
            <Badge tone={QUOTE_STATUS[status].tone}>{QUOTE_STATUS[status].label}</Badge>
          </span>
        }
        actions={
          <>
            <LinkButton href={`/impressao/orcamento/${id}`} variant="secondary" prefetch={false} target="_blank">
              Gerar PDF
            </LinkButton>
            {edit && (
              <InlineActionButton action={duplicateQuoteAction} fields={{ id }} size="md">
                Nova versão
              </InlineActionButton>
            )}
            {edit && open && <LinkButton href={`/comercial/orcamentos/${id}/editar`} variant="secondary">Editar</LinkButton>}
            {edit && q.status === "rascunho" && (
              <InlineActionButton action={quoteStatusAction} fields={{ id, status: "enviado" }} size="md">
                Marcar como enviado
              </InlineActionButton>
            )}
            {edit && open && (
              <InlineActionButton action={quoteStatusAction} fields={{ id, status: "reprovado" }} size="md" variant="ghost" confirm="Marcar este orçamento como reprovado pelo cliente?">
                Reprovar
              </InlineActionButton>
            )}
            {can(user, "quotes:approve") && open && (
              <FormModal trigger="Aprovar e gerar obra" title="Aprovar orçamento" description="Cria contrato, cliente/obra, centro de custo, estoque da obra, orçamento de custos e previsão de recebimentos." action={approveQuoteAction} submitLabel="Aprovar e criar obra">
                <input type="hidden" name="id" value={id} />
                <div className="grid grid-cols-2 gap-3">
                  <Input name="startDate" type="date" label="Início previsto" defaultValue={addDays(today, 7)} required />
                  <Select name="billing" label="Cobrança" options={[{ value: "parcelas", label: "Parcelas fixas" }, { value: "medicao", label: "Por medição" }]} defaultValue="parcelas" />
                  <MoneyInput name="downPaymentPct" label="Entrada (%)" defaultValue="30" />
                  <Input name="installments" type="number" min={0} max={48} label="Nº de parcelas/medições" defaultValue="2" />
                  <Input name="retentionRate" inputMode="decimal" label="Retenção (%)" defaultValue="0" />
                </div>
                {pendingDiscount.length > 0 && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-[#8a5800]">O desconto ainda aguarda aprovação da alçada.</p>}
              </FormModal>
            )}
          </>
        }
      />

      {contract[0] && (
        <p className="mb-6 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          Aprovado: contrato {contract[0].c.number}
          {contract[0].projectId && (
            <>
              {" "}e obra{" "}
              <Link href={`/obras/${contract[0].projectId}`} className="font-semibold underline">
                {contract[0].projectCode}
              </Link>
            </>
          )}{" "}
          criados automaticamente.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Itens" description={`${area(t.area)} no total`} />
          <Table>
            <thead>
              <tr>
                <Th>Serviço</Th>
                <Th align="right">Qtd.</Th>
                <Th align="right">Preço/un.</Th>
                <Th align="right">Total</Th>
                {edit && <Th align="right">Custo</Th>}
                {edit && <Th align="right">Margem bruta</Th>}
              </tr>
            </thead>
            <tbody>
              {t.lines.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <p className="font-medium">{l.service}</p>
                    <p className="text-[12px] text-muted">{[systems.find((s) => s.id === l.systemId)?.name, l.description].filter(Boolean).join(". ")}</p>
                  </Td>
                  <Td align="right">
                    {number(l.quantity)} {l.unit}
                  </Td>
                  <Td align="right">{money(l.unitPrice)}</Td>
                  <Td align="right" className="font-medium">
                    {money(l.total)}
                  </Td>
                  {edit && <Td align="right">{money(l.cost)}</Td>}
                  {edit && <Td align="right" className={(l.margin ?? 0) < 25 ? "text-danger" : ""}>{pct(l.margin, 0)}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Valores" />
            <CardBody>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular">{money(t.gross)}</dd></div>
                <div className="flex justify-between"><dt>Desconto</dt><dd className="tabular">− {money(q.discount)}</dd></div>
                <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><dt>Valor da proposta</dt><dd className="tabular">{money(t.total)}</dd></div>
                {edit && (
                  <>
                    <div className="flex justify-between text-muted"><dt>Impostos ({pct(q.taxRate, 1)})</dt><dd className="tabular">{money(t.taxes)}</dd></div>
                    <div className="flex justify-between text-muted"><dt>Custo direto previsto</dt><dd className="tabular">{money(t.cost)}</dd></div>
                  </>
                )}
              </dl>
              {edit && <p className={cn("font-display mt-3 text-3xl font-semibold", (t.margin ?? 0) < 20 ? "text-danger" : "text-success")}>Margem {pct(t.margin)}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Condições" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-3">
                <Field label="Validade">{date(q.validUntil)}</Field>
                <Field label="Prazo de execução">{q.executionDays ? `${q.executionDays} dias` : "—"}</Field>
                <Field label="Garantia">{q.warrantyMonths ? `${q.warrantyMonths} meses` : "—"}</Field>
                <Field label="Local">{[q.siteAddress, q.siteCity].filter(Boolean).join(", ") || "—"}</Field>
                <Field label="Pagamento" className="col-span-2">{q.paymentTerms}</Field>
                {q.notes && <Field label="Observações" className="col-span-2">{q.notes}</Field>}
              </dl>
            </CardBody>
          </Card>
          {versions.length > 1 && (
            <Card>
              <CardHeader title="Versões" />
              <ul className="divide-y divide-border">
                {versions.map((v) => (
                  <li key={v.id} className="flex justify-between px-5 py-2.5 text-sm">
                    <Link href={`/comercial/orcamentos/${v.id}`} className={v.id === id ? "font-semibold" : "hover:text-primary"}>
                      Versão {v.version}
                    </Link>
                    <Badge tone={QUOTE_STATUS[v.status].tone}>{QUOTE_STATUS[v.status].label}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
