import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { QuoteEditor } from "../quote-editor";
import { PageHeader } from "@/components/ui/primitives";
import { addDays, todayISO } from "@/domain/dates";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { leads, technicalVisits, waterproofingSystems } from "@/server/db/schema";
import { financeOptions } from "@/server/services/options";

export const metadata: Metadata = { title: "Novo orçamento" };

export default async function NovoOrcamento({ searchParams }: { searchParams: Promise<{ lead?: string; cliente?: string; visita?: string }> }) {
  const user = await requireUser("crm:edit");
  const sp = await searchParams;
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined);
  const [opts, systems, lead, visit] = await Promise.all([
    financeOptions(user.companyId),
    db.select({ value: waterproofingSystems.id, label: waterproofingSystems.name }).from(waterproofingSystems).where(and(eq(waterproofingSystems.companyId, user.companyId), eq(waterproofingSystems.active, true))).orderBy(asc(waterproofingSystems.name)),
    uuid(sp.lead) ? db.select().from(leads).where(and(eq(leads.id, sp.lead!), eq(leads.companyId, user.companyId))).then((r) => r[0]) : undefined,
    uuid(sp.visita) ? db.select().from(technicalVisits).where(and(eq(technicalVisits.id, sp.visita!), eq(technicalVisits.companyId, user.companyId))).then((r) => r[0]) : undefined,
  ]);
  return (
    <>
      <PageHeader back={{ href: "/comercial/orcamentos", label: "Orçamentos" }} title="Novo orçamento" description={lead ? `Para o lead ${lead.name}. ${lead.clientId ? "" : "Cadastre o cliente antes, se ainda não existir."}` : undefined} />
      <QuoteEditor
        clients={opts.clients}
        systems={systems}
        defaults={{
          clientId: uuid(sp.cliente) ?? lead?.clientId ?? visit?.clientId ?? undefined,
          leadId: lead?.id ?? visit?.leadId ?? undefined,
          visitId: visit?.id,
          title: lead?.name ? `Impermeabilização — ${lead.name}` : undefined,
          siteAddress: visit?.address ?? undefined,
          area: visit?.approxArea ?? undefined,
          description: visit?.proposedSolution ?? undefined,
          validUntil: addDays(todayISO(), 15),
        }}
      />
    </>
  );
}
