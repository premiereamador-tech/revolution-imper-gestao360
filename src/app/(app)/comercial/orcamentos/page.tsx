import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { FilterBar } from "@/components/ui/filter-bar";
import { Badge, Card, EmptyState, Kpi, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { todayISO } from "@/domain/dates";
import { date, money, moneyShort } from "@/lib/format";
import { QUOTE_STATUS } from "@/lib/labels";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { clients, quotes } from "@/server/db/schema";

export const metadata: Metadata = { title: "Orçamentos" };

export default async function OrcamentosPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const user = await requireUser("crm:view");
  const f = await searchParams;
  const today = todayISO();
  const rows = await db
    .select({
      q: quotes,
      clientName: clients.name,
      total: sql<string>`coalesce((select sum(qi.quantity * qi.unit_price) from quote_items qi where qi.quote_id = "quotes"."id"), 0) - ${quotes.discount}`,
    })
    .from(quotes)
    .innerJoin(clients, eq(clients.id, quotes.clientId))
    .where(and(eq(quotes.companyId, user.companyId), f.q ? sql`(${quotes.title} ilike ${"%" + f.q + "%"} or ${clients.name} ilike ${"%" + f.q + "%"})` : undefined))
    .orderBy(desc(quotes.number), desc(quotes.version));
  const withStatus = rows.map((r) => ({ ...r, status: r.q.status === "enviado" && r.q.validUntil && r.q.validUntil < today ? "expirado" : r.q.status }));
  const list = f.status ? withStatus.filter((r) => r.status === f.status) : withStatus;
  const sum = (s: string) => withStatus.filter((r) => r.status === s).reduce((a, r) => a + Number(r.total), 0);
  return (
    <>
      <PageHeader title="Orçamentos" description="Versões, envio, aprovação e conversão automática em contrato e obra." actions={can(user, "crm:edit") && <LinkButton href="/comercial/orcamentos/novo">Novo orçamento</LinkButton>} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Em rascunho" value={moneyShort(sum("rascunho"))} href="/comercial/orcamentos?status=rascunho" />
        <Kpi label="Enviados, aguardando cliente" value={moneyShort(sum("enviado"))} href="/comercial/orcamentos?status=enviado" />
        <Kpi label="Aprovados" value={moneyShort(sum("aprovado"))} tone="positive" href="/comercial/orcamentos?status=aprovado" />
        <Kpi label="Vencidos sem resposta" value={moneyShort(sum("expirado"))} tone="warning" href="/comercial/orcamentos?status=expirado" />
      </div>
      <FilterBar
        fields={[
          { name: "q", label: "Buscar", type: "search", placeholder: "Título ou cliente" },
          { name: "status", label: "Status", type: "select", options: Object.entries(QUOTE_STATUS).map(([v, s]) => ({ value: v, label: s.label })) },
        ]}
      />
      <Card>
        {list.length === 0 ? (
          <EmptyState title="Nenhum orçamento" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nº</Th>
                <Th>Proposta</Th>
                <Th>Cliente</Th>
                <Th>Validade</Th>
                <Th align="right">Valor</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ q, clientName, total, status }) => (
                <tr key={q.id}>
                  <Td className="tabular">
                    {q.number}
                    <span className="text-muted">.v{q.version}</span>
                  </Td>
                  <Td>
                    <Link href={`/comercial/orcamentos/${q.id}`} className="font-medium hover:text-primary">
                      {q.title}
                    </Link>
                  </Td>
                  <Td>{clientName}</Td>
                  <Td className="tabular">{date(q.validUntil)}</Td>
                  <Td align="right">{money(Number(total))}</Td>
                  <Td>
                    <Badge tone={QUOTE_STATUS[status].tone}>{QUOTE_STATUS[status].label}</Badge>
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
