import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, ilike, or, sql, and } from "drizzle-orm";
import { FilterBar } from "@/components/ui/filter-bar";
import { Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { formatDocument, formatPhone } from "@/domain/br";
import { money } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { accountsReceivable, clients, projects } from "@/server/db/schema";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string; cidade?: string }> }) {
  const user = await requireUser("clients:view");
  const { q, cidade } = await searchParams;
  const rows = await db
    .select({
      c: clients,
      projects: sql<string>`(select count(*) from ${projects} p where p.client_id = "clients"."id")`,
      open: sql<string>`coalesce((select sum(greatest(ar.amount - ar.discount + ar.interest - ar.received_amount, 0)) from ${accountsReceivable} ar where ar.client_id = "clients"."id" and not ar.cancelled and not ar.forecast), 0)`,
    })
    .from(clients)
    .where(and(eq(clients.companyId, user.companyId), q ? or(ilike(clients.name, `%${q}%`), ilike(clients.tradeName, `%${q}%`), ilike(clients.document, `%${q.replace(/\D/g, "") || q}%`)) : undefined, cidade ? eq(clients.city, cidade) : undefined))
    .orderBy(asc(clients.name))
    .limit(500);
  const cities = await db.selectDistinct({ city: clients.city }).from(clients).where(eq(clients.companyId, user.companyId));
  const fin = can(user, "finance:view");
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Todo o histórico (orçamentos, obras, recebimentos e garantias) fica ligado ao cliente."
        actions={
          <>
            <LinkButton href="/api/export/clientes" variant="secondary" prefetch={false}>
              Exportar Excel/CSV
            </LinkButton>
            {can(user, "clients:edit") && <LinkButton href="/clientes/novo">Novo cliente</LinkButton>}
          </>
        }
      />
      <FilterBar
        fields={[
          { name: "q", label: "Buscar", type: "search", placeholder: "Nome, fantasia ou CPF/CNPJ" },
          { name: "cidade", label: "Cidade", type: "select", options: cities.filter((c) => c.city).map((c) => ({ value: c.city!, label: c.city! })) },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Nenhum cliente encontrado" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>CPF/CNPJ</Th>
                <Th>Contato</Th>
                <Th>Cidade</Th>
                <Th align="right">Obras</Th>
                {fin && <Th align="right">Em aberto</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, projects: n, open }) => (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/clientes/${c.id}`} className="font-medium hover:text-primary">
                      {c.name}
                    </Link>
                    {c.tradeName && <p className="text-[12px] text-muted">{c.tradeName}</p>}
                  </Td>
                  <Td className="tabular">{formatDocument(c.document)}</Td>
                  <Td className="text-[13px]">
                    {c.contactName}
                    <p className="text-muted">{formatPhone(c.whatsapp ?? c.phone)}</p>
                  </Td>
                  <Td>{c.city ? `${c.city}/${c.state}` : "—"}</Td>
                  <Td align="right">{n}</Td>
                  {fin && <Td align="right">{money(Number(open))}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
