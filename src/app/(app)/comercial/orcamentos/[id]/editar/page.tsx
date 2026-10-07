import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { QuoteEditor } from "../../quote-editor";
import { LinkButton, PageHeader } from "@/components/ui/primitives";
import { addDays, todayISO } from "@/domain/dates";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { quoteItems, quotes, waterproofingSystems } from "@/server/db/schema";
import { financeOptions } from "@/server/services/options";

export const metadata: Metadata = { title: "Editar orçamento" };

export default async function EditarOrcamento({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("crm:edit");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [q] = await db.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.companyId, user.companyId))).limit(1);
  if (!q) notFound();
  if (q.status === "aprovado" || q.status === "reprovado")
    return (
      <>
        <PageHeader title="Orçamento finalizado" description="Orçamentos aprovados ou reprovados não podem ser alterados. Duplique para criar uma nova versão." />
        <LinkButton href={`/comercial/orcamentos/${id}`}>Voltar ao orçamento</LinkButton>
      </>
    );
  const [items, opts, systems] = await Promise.all([
    db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.position)),
    financeOptions(user.companyId),
    db.select({ value: waterproofingSystems.id, label: waterproofingSystems.name }).from(waterproofingSystems).where(eq(waterproofingSystems.companyId, user.companyId)).orderBy(asc(waterproofingSystems.name)),
  ]);
  return (
    <>
      <PageHeader back={{ href: `/comercial/orcamentos/${id}`, label: `Orçamento ${q.number}` }} title={`Editar orçamento ${q.number} (versão ${q.version})`} />
      <QuoteEditor initial={{ ...q, items }} defaults={{ validUntil: addDays(todayISO(), 15) }} clients={opts.clients} systems={systems} />
    </>
  );
}
