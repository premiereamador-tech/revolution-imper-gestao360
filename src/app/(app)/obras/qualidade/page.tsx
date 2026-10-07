import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { HorizontalBars } from "@/components/charts/charts";
import { Badge, Card, CardHeader, Kpi, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { date, money, moneyShort, pct } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { nonconformities, projects, teams, waterproofingSystems, projectAreas } from "@/server/db/schema";
import { NC_STATUS, SEVERITY } from "../[id]/_tabs/quality";

export const metadata: Metadata = { title: "Qualidade" };

export default async function QualidadePage() {
  const user = await requireUser("projects:view");
  const rows = await db
    .select({ nc: nonconformities, code: projects.code, projectName: projects.name, teamName: teams.name, systemName: waterproofingSystems.name })
    .from(nonconformities)
    .innerJoin(projects, eq(projects.id, nonconformities.projectId))
    .leftJoin(teams, eq(teams.id, nonconformities.teamId))
    .leftJoin(waterproofingSystems, eq(waterproofingSystems.id, nonconformities.systemId))
    .where(eq(projects.companyId, user.companyId))
    .orderBy(desc(nonconformities.detectedAt));
  const [areaTotal] = await db
    .select({ executed: sql<string>`coalesce(sum(${projectAreas.executedArea}), 0)` })
    .from(projectAreas)
    .innerJoin(projects, eq(projects.id, projectAreas.projectId))
    .where(and(eq(projects.companyId, user.companyId)));
  const open = rows.filter((r) => r.nc.status === "aberta" || r.nc.status === "em_tratamento");
  const rework = rows.filter((r) => r.nc.isRework);
  const group = (key: (r: (typeof rows)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rework) {
      const k = key(r) ?? "Não informado";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const causes = (() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.nc.cause ?? "Não informada", (m.get(r.nc.cause ?? "Não informada") ?? 0) + 1);
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  })();
  const byMonth = new Map<string, number>();
  for (const r of rows) byMonth.set(r.nc.detectedAt.slice(0, 7), (byMonth.get(r.nc.detectedAt.slice(0, 7)) ?? 0) + 1);
  const reworkCost = rework.reduce((s, r) => s + r.nc.estimatedReworkCost, 0);
  const reworkPct = Number(areaTotal.executed) ? (rework.length / Number(areaTotal.executed)) * 1000 : null;

  return (
    <>
      <PageHeader title="Qualidade" description="Não conformidades, retrabalho e principais causas em todas as obras." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Em aberto" value={open.length} tone={open.length ? "negative" : "default"} />
        <Kpi label="Críticas em aberto" value={open.filter((r) => r.nc.severity === "critica").length} tone="negative" />
        <Kpi label="Retrabalhos registrados" value={rework.length} />
        <Kpi label="Custo estimado de retrabalho" value={moneyShort(reworkCost)} />
        <Kpi label="Retrabalho por 1.000 m²" value={reworkPct === null ? "—" : pct(reworkPct, 2).replace("%", "")} hint="Ocorrências ÷ área executada" />
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Retrabalho por obra" />
          <div className="p-3">
            <HorizontalBars data={group((r) => r.code)} valueLabel="Ocorrências" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Retrabalho por equipe" />
          <div className="p-3">
            <HorizontalBars data={group((r) => r.teamName)} valueLabel="Ocorrências" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Retrabalho por sistema" />
          <div className="p-3">
            <HorizontalBars data={group((r) => r.systemName)} valueLabel="Ocorrências" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Principais causas" />
          <div className="p-3">
            <HorizontalBars data={causes} valueLabel="Ocorrências" />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Não conformidades por mês" />
          <div className="p-3">
            <HorizontalBars data={[...byMonth.entries()].sort().map(([m, value]) => ({ label: `${m.slice(5)}/${m.slice(0, 4)}`, value }))} valueLabel="Ocorrências" />
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Todas as não conformidades" />
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Obra</Th>
              <Th>Ocorrência</Th>
              <Th>Gravidade</Th>
              <Th align="right">Retrabalho</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.nc.id}>
                <Td className="tabular">{date(r.nc.detectedAt)}</Td>
                <Td>
                  <Link href={`/obras/${r.nc.projectId}?tab=qualidade`} className="hover:text-primary">
                    {r.code}
                  </Link>
                </Td>
                <Td>{r.nc.title}</Td>
                <Td>
                  <Badge tone={SEVERITY[r.nc.severity].tone}>{SEVERITY[r.nc.severity].label}</Badge>
                </Td>
                <Td align="right">{money(r.nc.estimatedReworkCost)}</Td>
                <Td>
                  <Badge tone={NC_STATUS[r.nc.status].tone}>{NC_STATUS[r.nc.status].label}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
