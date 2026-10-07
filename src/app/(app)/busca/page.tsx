import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { onlyDigits } from "@/domain/br";
import { date, money } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { accountsPayable, accountsReceivable, clients, contracts, documents, employees, equipment, products, projects, suppliers } from "@/server/db/schema";

export const metadata: Metadata = { title: "Busca" };

/** Busca global (§55): respeita as permissões de cada área. */
export default async function BuscaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q: raw = "" } = await searchParams;
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return <PageHeader title="Busca" description="Digite pelo menos 2 caracteres na barra de busca." />;
  const like = `%${q}%`;
  const digits = onlyDigits(q);
  const C = user.companyId;
  const L = 8;
  const run = <T,>(perm: Parameters<typeof can>[1], fn: () => Promise<T[]>) => (can(user, perm) ? fn() : Promise.resolve([] as T[]));

  const [obras, cls, emps, sups, ctrs, prods, eqs, recs, pays, docs] = await Promise.all([
    run("projects:view", () => db.select({ id: projects.id, title: projects.name, sub: projects.code }).from(projects).where(and(eq(projects.companyId, C), or(ilike(projects.name, like), ilike(projects.code, like), ilike(projects.city, like)))).limit(L)),
    run("clients:view", () => db.select({ id: clients.id, title: clients.name, sub: clients.city }).from(clients).where(and(eq(clients.companyId, C), or(ilike(clients.name, like), ilike(clients.tradeName, like), digits.length >= 3 ? ilike(clients.document, `%${digits}%`) : undefined))).limit(L)),
    run("employees:view", () => db.select({ id: employees.id, title: employees.name, sub: employees.jobTitle }).from(employees).where(and(eq(employees.companyId, C), ilike(employees.name, like))).limit(L)),
    run("stock:view", () => db.select({ id: suppliers.id, title: sql<string>`coalesce(${suppliers.tradeName}, ${suppliers.legalName})`, sub: suppliers.productsSupplied }).from(suppliers).where(and(eq(suppliers.companyId, C), or(ilike(suppliers.legalName, like), ilike(suppliers.tradeName, like)))).limit(L)),
    run("projects:view", () => db.select({ id: contracts.id, title: contracts.number, sub: sql<string>`${contracts.value}::text`, projectId: projects.id }).from(contracts).leftJoin(projects, eq(projects.contractId, contracts.id)).where(and(eq(contracts.companyId, C), ilike(contracts.number, like))).limit(L)),
    run("stock:view", () => db.select({ id: products.id, title: products.name, sub: products.sku }).from(products).where(and(eq(products.companyId, C), or(ilike(products.name, like), ilike(products.sku, like), ilike(products.manufacturer, like)))).limit(L)),
    run("equipment:edit", () => db.select({ id: equipment.id, title: equipment.name, sub: equipment.assetTag }).from(equipment).where(and(eq(equipment.companyId, C), or(ilike(equipment.name, like), ilike(equipment.assetTag, like)))).limit(L)),
    run("finance:view", () => db.select({ id: accountsReceivable.id, title: accountsReceivable.description, sub: accountsReceivable.dueDate, value: accountsReceivable.amount }).from(accountsReceivable).where(and(eq(accountsReceivable.companyId, C), ilike(accountsReceivable.description, like))).limit(L)),
    run("finance:view", () => db.select({ id: accountsPayable.id, title: accountsPayable.description, sub: accountsPayable.dueDate, value: accountsPayable.amount }).from(accountsPayable).where(and(eq(accountsPayable.companyId, C), or(ilike(accountsPayable.description, like), ilike(accountsPayable.documentNumber, like)))).limit(L)),
    run("projects:view", () => db.select({ id: documents.id, title: documents.title, sub: documents.folder, projectId: documents.projectId }).from(documents).where(and(eq(documents.companyId, C), ilike(documents.title, like))).limit(L)),
  ]);

  const groups: Array<{ title: string; items: Array<{ key: string; href: string; title: string; sub?: string | null }> }> = [
    { title: "Obras", items: obras.map((r) => ({ key: r.id, href: `/obras/${r.id}`, title: r.title, sub: r.sub })) },
    { title: "Clientes", items: cls.map((r) => ({ key: r.id, href: `/clientes/${r.id}`, title: r.title, sub: r.sub })) },
    { title: "Funcionários", items: emps.map((r) => ({ key: r.id, href: `/equipe/funcionarios/${r.id}`, title: r.title, sub: r.sub })) },
    { title: "Fornecedores", items: sups.map((r) => ({ key: r.id, href: `/suprimentos/fornecedores`, title: r.title, sub: r.sub })) },
    { title: "Contratos", items: ctrs.map((r) => ({ key: r.id, href: r.projectId ? `/obras/${r.projectId}?tab=financeiro` : "/obras", title: r.title, sub: money(Number(r.sub)) })) },
    { title: "Produtos", items: prods.map((r) => ({ key: r.id, href: `/suprimentos/estoque?q=${encodeURIComponent(r.sub)}`, title: r.title, sub: r.sub })) },
    { title: "Equipamentos", items: eqs.map((r) => ({ key: r.id, href: `/patrimonio`, title: r.title, sub: r.sub })) },
    { title: "Recebimentos", items: recs.map((r) => ({ key: r.id, href: `/financeiro/receber?q=${encodeURIComponent(r.title)}`, title: r.title, sub: `${date(r.sub)}, ${money(r.value)}` })) },
    { title: "Pagamentos", items: pays.map((r) => ({ key: r.id, href: `/financeiro/pagar?q=${encodeURIComponent(r.title)}`, title: r.title, sub: `${date(r.sub)}, ${money(r.value)}` })) },
    { title: "Documentos", items: docs.map((r) => ({ key: r.id, href: r.projectId ? `/obras/${r.projectId}` : "/obras", title: r.title, sub: r.sub })) },
  ].filter((g) => g.items.length);

  return (
    <>
      <PageHeader title={`Resultados para "${q}"`} description={`${groups.reduce((s, g) => s + g.items.length, 0)} resultado(s).`} />
      {groups.length === 0 ? (
        <Card>
          <EmptyState title="Nada encontrado" description="Tente o código da obra (OB-001), parte do nome, CPF/CNPJ, código do produto ou do patrimônio." />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.title}>
              <CardHeader title={g.title} />
              <ul className="divide-y divide-border">
                {g.items.map((i) => (
                  <li key={i.key}>
                    <Link href={i.href} className="block px-5 py-2.5 hover:bg-surface-2">
                      <p className="text-sm font-medium">{i.title}</p>
                      {i.sub && <p className="truncate text-[12px] text-muted">{i.sub}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
