import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { DocHeader, DocSection, Signature } from "@/components/domain/doc-header";
import { formatDocument, formatPhone } from "@/domain/br";
import { date, money, number } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { clients, quoteItems, quotes, users, waterproofingSystems } from "@/server/db/schema";
import { computeQuote } from "@/server/services/commercial";

export const metadata: Metadata = { title: "Proposta comercial" };

/** PDF da proposta (§24). Não exibe custos internos nem margem. */
export default async function OrcamentoPdf({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("crm:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [row] = await db
    .select({ q: quotes, c: clients, seller: users.name })
    .from(quotes)
    .innerJoin(clients, eq(clients.id, quotes.clientId))
    .leftJoin(users, eq(users.id, quotes.createdById))
    .where(and(eq(quotes.id, id), eq(quotes.companyId, user.companyId)))
    .limit(1);
  if (!row) notFound();
  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.position));
  const systems = await db.select().from(waterproofingSystems).where(eq(waterproofingSystems.companyId, user.companyId));
  const t = computeQuote(row.q, items);
  const { q, c } = row;
  return (
    <>
      <DocHeader title="Proposta comercial" subtitle={`Nº ${q.number}-${q.version} | emitida em ${date(q.createdAt)} | válida até ${date(q.validUntil)}`} right={<p>Impermeabilização com garantia e rastreabilidade de materiais</p>} />
      <DocSection title="Cliente">
        <p className="font-medium">{c.name}</p>
        <p className="text-muted">
          {formatDocument(c.document)}
          {c.contactName ? `, A/C ${c.contactName}` : ""}
          {c.whatsapp ? `, ${formatPhone(c.whatsapp)}` : ""}
          {c.email ? `, ${c.email}` : ""}
        </p>
        <p className="mt-1">
          <span className="text-muted">Obra:</span> {q.title}
          {q.siteAddress || q.siteCity ? ` — ${[q.siteAddress, q.siteCity, q.siteState].filter(Boolean).join(", ")}` : ""}
        </p>
      </DocSection>
      <DocSection title="Escopo e valores">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-abyss text-left text-white">
              <th className="px-2 py-1.5 font-medium">Serviço</th>
              <th className="px-2 py-1.5 text-right font-medium">Qtd.</th>
              <th className="px-2 py-1.5 text-right font-medium">Valor unit.</th>
              <th className="px-2 py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {t.lines.map((l, i) => (
              <tr key={l.id} className={i % 2 ? "bg-surface-2" : ""}>
                <td className="px-2 py-2 align-top">
                  <p className="font-medium">{l.service}</p>
                  {(l.description || l.systemId) && <p className="text-[11px] text-muted">{[systems.find((s) => s.id === l.systemId)?.name, l.description].filter(Boolean).join(". ")}</p>}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right align-top tabular">
                  {number(l.quantity)} {l.unit}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right align-top tabular">{money(l.unitPrice)}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right align-top font-medium tabular">{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {q.discount > 0 && (
              <>
                <tr>
                  <td colSpan={3} className="px-2 pt-2 text-right">Subtotal</td>
                  <td className="px-2 pt-2 text-right tabular">{money(t.gross)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-2 text-right">Desconto</td>
                  <td className="px-2 text-right tabular">− {money(q.discount)}</td>
                </tr>
              </>
            )}
            <tr>
              <td colSpan={3} className="px-2 pt-2 text-right font-display text-[16px] font-semibold">Valor total</td>
              <td className="px-2 pt-2 text-right font-display text-[18px] font-semibold text-primary-strong tabular">{money(t.total)}</td>
            </tr>
          </tfoot>
        </table>
      </DocSection>
      <DocSection title="Condições">
        <ul className="list-disc space-y-1 pl-5">
          <li>Prazo de execução: {q.executionDays ? `${q.executionDays} dias corridos após liberação da área` : "a combinar"}.</li>
          <li>Forma de pagamento: {q.paymentTerms ?? "a combinar"}.</li>
          <li>Garantia: {q.warrantyMonths ? `${q.warrantyMonths} meses a partir do termo de entrega, conforme manual de uso e manutenção` : "conforme contrato"}.</li>
          <li>Materiais com rastreabilidade de lote, ficha técnica e registro fotográfico de todas as etapas.</li>
          <li>Proposta válida até {date(q.validUntil)}.</li>
        </ul>
        {q.notes && <p className="mt-2 whitespace-pre-line">{q.notes}</p>}
      </DocSection>
      <div className="mt-8 grid grid-cols-2 gap-8">
        <Signature label="Revolution Imper" name={row.seller} />
        <Signature label="De acordo, cliente" name={c.contactName ?? c.name} />
      </div>
    </>
  );
}
