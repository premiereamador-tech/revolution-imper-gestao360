import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { HorizontalBars } from "@/components/charts/charts";
import { Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { addDays, todayISO } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { area, number } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { dailyLogs, employees, projects, timeEntries, waterproofingApplications, waterproofingSystems, projectAreas } from "@/server/db/schema";
import { teamProductivity } from "@/server/services/insights";

export const metadata: Metadata = { title: "Produtividade" };

export default async function ProdutividadePage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const user = await requireUser("employees:view");
  const { dias = "30" } = await searchParams;
  const days = [7, 30, 90, 365].includes(Number(dias)) ? Number(dias) : 30;
  const since = addDays(todayISO(), -days);
  const [teams, people, byProject, bySystem] = await Promise.all([
    teamProductivity(user.companyId, since),
    db
      .select({
        id: employees.id,
        name: employees.name,
        job: employees.jobTitle,
        days: sql<string>`count(*) filter (where ${timeEntries.type} = 'trabalho')`,
        hours: sql<string>`coalesce(sum(${timeEntries.workedHours}), 0)`,
        area: sql<string>`coalesce(sum(${timeEntries.executedArea}), 0)`,
      })
      .from(timeEntries)
      .innerJoin(employees, eq(employees.id, timeEntries.employeeId))
      .where(and(eq(employees.companyId, user.companyId), sql`${timeEntries.date} >= ${since}`))
      .groupBy(employees.id, employees.name, employees.jobTitle),
    db
      .select({ id: projects.id, code: projects.code, name: projects.name, area: sql<string>`sum(${dailyLogs.executedArea})`, days: sql<string>`count(distinct ${dailyLogs.date}) filter (where ${dailyLogs.executedArea} > 0)`, hours: sql<string>`sum(${dailyLogs.hoursWorked})` })
      .from(dailyLogs)
      .innerJoin(projects, eq(projects.id, dailyLogs.projectId))
      .where(and(eq(projects.companyId, user.companyId), sql`${dailyLogs.date} >= ${since}`))
      .groupBy(projects.id, projects.code, projects.name),
    db
      .select({ name: waterproofingSystems.name, area: sql<string>`sum(${dailyLogs.executedArea})` })
      .from(dailyLogs)
      .innerJoin(projects, eq(projects.id, dailyLogs.projectId))
      .innerJoin(projectAreas, eq(projectAreas.id, dailyLogs.areaId))
      .innerJoin(waterproofingApplications, eq(waterproofingApplications.areaId, projectAreas.id))
      .innerJoin(waterproofingSystems, eq(waterproofingSystems.id, waterproofingApplications.systemId))
      .where(and(eq(projects.companyId, user.companyId), sql`${dailyLogs.date} >= ${since}`))
      .groupBy(waterproofingSystems.name),
  ]);
  const ranking = people
    .map((p) => ({ ...p, perHour: Number(p.hours) ? Number(p.area) / Number(p.hours) : 0, perDay: Number(p.days) ? Number(p.area) / Number(p.days) : 0 }))
    .filter((p) => Number(p.days) > 0)
    .sort((a, b) => b.perHour - a.perHour);
  const avg = ranking.length ? ranking.reduce((s, r) => s + r.perHour, 0) / ranking.length : 0;

  return (
    <>
      <PageHeader title="Produtividade" description="Informação gerencial para planejar equipes e metas. Não é usada como mecanismo automático de punição." />
      <div className="no-print mb-4 flex gap-1">
        {[7, 30, 90, 365].map((d) => (
          <Link key={d} href={`/equipe/produtividade?dias=${d}`} className={cn("rounded-md px-3 py-1.5 text-sm", d === days ? "bg-primary text-white" : "text-muted hover:bg-surface-2")}>
            {d === 365 ? "12 meses" : `${d} dias`}
          </Link>
        ))}
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="m² por dia, por equipe" />
          <div className="p-3">
            <HorizontalBars data={teams.map((t) => ({ label: t.name, value: t.areaPerDay ?? 0 }))} valueLabel="m²/dia" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Produção por obra" />
          <div className="p-3">
            <HorizontalBars data={byProject.map((p) => ({ label: p.code, value: Math.round(Number(p.area)) }))} valueLabel="m²" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Produção por sistema" />
          <div className="p-3">
            <HorizontalBars data={bySystem.map((s) => ({ label: s.name, value: Math.round(Number(s.area)) }))} valueLabel="m²" />
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Ranking interno por pessoa" description="m² apropriados pelo ponto (produção do dia dividida entre os presentes)." />
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Funcionário</Th>
              <Th align="right">Dias</Th>
              <Th align="right">Horas</Th>
              <Th align="right">m²</Th>
              <Th align="right">m²/dia</Th>
              <Th align="right">m²/hora</Th>
              <Th align="right">vs. média</Th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => (
              <tr key={r.id}>
                <Td>{i + 1}</Td>
                <Td>
                  {r.name}
                  <p className="text-[12px] text-muted">{r.job}</p>
                </Td>
                <Td align="right">{r.days}</Td>
                <Td align="right">{number(Number(r.hours), 0)}</Td>
                <Td align="right">{area(Number(r.area))}</Td>
                <Td align="right">{number(r.perDay, 1)}</Td>
                <Td align="right">{number(r.perHour, 2)}</Td>
                <Td align="right" className={r.perHour >= avg ? "text-success" : "text-muted"}>
                  {avg ? `${r.perHour >= avg ? "+" : ""}${number(((r.perHour - avg) / avg) * 100, 0)}%` : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
