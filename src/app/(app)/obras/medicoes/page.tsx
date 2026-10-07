import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Badge, Card, CardHeader, EmptyState, Kpi, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { MEASUREMENT_FLOW } from "@/domain/measurement";
import { date, money, moneyShort } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { measurements, projects } from "@/server/db/schema";

export const metadata: Metadata = { title: "Medições" };
const LABEL: Record<string, string> = { prevista: "Prevista", executada: "Aguardando aprovação", aprovada: "Aprovada, a faturar", faturada: "Faturada", recebida: "Recebida" };
const TONE: Record<string, string> = { prevista: "slate", executada: "amber", aprovada: "blue", faturada: "violet", recebida: "green" };

export default async function MedicoesPage() {
  const user = await requireUser("projects:view");
  const rows = await db
    .select({ m: measurements, code: projects.code, name: projects.name, projectId: projects.id })
    .from(measurements)
    .innerJoin(projects, eq(projects.id, measurements.projectId))
    .where(eq(projects.companyId, user.companyId))
    .orderBy(desc(measurements.periodEnd))
    .limit(500);
  const fin = can(user, "projects:finance");
  return (
    <>
      <PageHeader title="Medições" description="Todas as medições das obras, do registro ao recebimento. Para lançar uma nova medição, abra a obra." />
      {fin && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {MEASUREMENT_FLOW.map((s) => (
            <Kpi key={s} label={LABEL[s]} value={moneyShort(rows.filter((r) => r.m.status === s).reduce((a, r) => a + r.m.netValue, 0))} hint={`${rows.filter((r) => r.m.status === s).length} medição(ões)`} />
          ))}
        </div>
      )}
      <Card>
        <CardHeader title="Medições" />
        {rows.length === 0 ? (
          <EmptyState title="Nenhuma medição registrada" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Obra</Th>
                <Th>Nº</Th>
                <Th>Período</Th>
                {fin && <Th align="right">Bruto</Th>}
                {fin && <Th align="right">Líquido</Th>}
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, code, name, projectId }) => (
                <tr key={m.id}>
                  <Td>
                    <Link href={`/obras/${projectId}?tab=medicoes`} className="font-medium hover:text-primary">
                      {name}
                    </Link>
                    <p className="text-[12px] text-muted">{code}</p>
                  </Td>
                  <Td>{m.number}</Td>
                  <Td className="tabular">
                    {date(m.periodStart)} a {date(m.periodEnd)}
                  </Td>
                  {fin && <Td align="right">{money(m.grossValue)}</Td>}
                  {fin && <Td align="right">{money(m.netValue)}</Td>}
                  <Td>
                    <Badge tone={TONE[m.status]}>{LABEL[m.status]}</Badge>
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
