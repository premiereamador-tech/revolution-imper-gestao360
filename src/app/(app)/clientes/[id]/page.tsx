import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ClientForm } from "@/components/domain/client-form";
import { ProjectTable } from "@/components/domain/project-table";
import { Badge, Card, CardHeader, EmptyState, Kpi, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { receivableStatus } from "@/domain/receivables";
import { todayISO } from "@/domain/dates";
import { formatDocument } from "@/domain/br";
import { date, money, moneyShort } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { accountsReceivable, clients, leads, quotes, serviceRequests } from "@/server/db/schema";
import { RECEIVABLE_STATUS } from "@/server/services/finance-lists";
import { loadProjectSummaries } from "@/server/services/project-summary";

export const metadata: Metadata = { title: "Cliente" };

export default async function ClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string }> }) {
  const user = await requireUser("clients:view");
  const { id } = await params;
  const { editar } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [client] = await db.select().from(clients).where(and(eq(clients.id, id), eq(clients.companyId, user.companyId))).limit(1);
  if (!client) notFound();
  const today = todayISO();
  const [summaries, ar, qs, ls, srs] = await Promise.all([
    loadProjectSummaries(user.companyId).then((l) => l.filter((p) => p.clientId === id)),
    db.select().from(accountsReceivable).where(and(eq(accountsReceivable.clientId, id), eq(accountsReceivable.cancelled, false))).orderBy(desc(accountsReceivable.dueDate)),
    db.select().from(quotes).where(eq(quotes.clientId, id)).orderBy(desc(quotes.createdAt)),
    db.select().from(leads).where(eq(leads.clientId, id)),
    db.select().from(serviceRequests).where(eq(serviceRequests.clientId, id)),
  ]);
  const fin = can(user, "finance:view");
  if (editar && can(user, "clients:edit"))
    return (
      <>
        <PageHeader back={{ href: `/clientes/${id}`, label: client.name }} title="Editar cliente" />
        <ClientForm client={client} />
      </>
    );

  const open = ar.filter((r) => !r.forecast).reduce((s, r) => s + Math.max(r.amount - r.discount + r.interest - r.receivedAmount, 0), 0);
  return (
    <>
      <PageHeader
        back={{ href: "/clientes", label: "Clientes" }}
        title={client.name}
        description={`${formatDocument(client.document)}${client.city ? `, ${client.city}/${client.state}` : ""}${client.contactName ? `. Contato: ${client.contactName}` : ""}`}
        actions={can(user, "clients:edit") && <Link href={`/clientes/${id}?editar=1`} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2">Editar cadastro</Link>}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Obras" value={summaries.length} />
        <Kpi label="Orçamentos" value={qs.length} />
        {fin && <Kpi label="Total contratado" value={moneyShort(summaries.reduce((s, p) => s + p.finance.revenue, 0))} />}
        {fin && <Kpi label="Em aberto" value={moneyShort(open)} tone={open > 0 ? "warning" : "default"} />}
      </div>
      <Card className="mb-6">
        <CardHeader title="Obras" />
        {summaries.length ? <ProjectTable projects={summaries} showFinance={can(user, "projects:finance")} /> : <EmptyState title="Nenhuma obra" />}
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Orçamentos" />
          {qs.length === 0 ? (
            <EmptyState title="Nenhum orçamento" />
          ) : (
            <ul className="divide-y divide-border">
              {qs.map((q) => (
                <li key={q.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <Link href={`/comercial/orcamentos/${q.id}`} className="hover:text-primary">
                    #{q.number} v{q.version} {q.title}
                  </Link>
                  <Badge tone={q.status === "aprovado" ? "green" : q.status === "reprovado" ? "red" : "blue"}>{q.status}</Badge>
                </li>
              ))}
            </ul>
          )}
          {ls.length > 0 && <p className="border-t border-border px-5 py-3 text-[12px] text-muted">{ls.length} lead(s) vinculados.</p>}
          {srs.length > 0 && <p className="border-t border-border px-5 py-3 text-[12px] text-muted">{srs.length} solicitação(ões) de pós-venda.</p>}
        </Card>
        {fin && (
          <Card>
            <CardHeader title="Financeiro do cliente" />
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
                {ar.slice(0, 30).map((r) => {
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
        )}
      </div>
    </>
  );
}
