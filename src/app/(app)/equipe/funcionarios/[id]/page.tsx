import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { EmployeeForm } from "@/components/domain/employee-form";
import { Avatar, Badge, Card, CardHeader, Kpi, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { addDays, todayISO } from "@/domain/dates";
import { area, date, money, number, time } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { employees, employeeTrainings, ppeDeliveries, ppeItems, projects, timeEntries, trainings } from "@/server/db/schema";
import { EMP_STATUS } from "@/lib/labels";

export const metadata: Metadata = { title: "Funcionário" };

export default async function FuncionarioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("employees:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [e] = await db.select().from(employees).where(and(eq(employees.id, id), eq(employees.companyId, user.companyId))).limit(1);
  if (!e) notFound();
  const today = todayISO();
  const since = addDays(today, -30);
  const [entries, [agg], ppe, tr] = await Promise.all([
    db.select({ t: timeEntries, code: projects.code }).from(timeEntries).leftJoin(projects, eq(projects.id, timeEntries.projectId)).where(eq(timeEntries.employeeId, id)).orderBy(desc(timeEntries.date)).limit(30),
    db
      .select({
        days: sql<string>`count(*) filter (where ${timeEntries.type} = 'trabalho')`,
        hours: sql<string>`coalesce(sum(${timeEntries.workedHours}), 0)`,
        overtime: sql<string>`coalesce(sum(${timeEntries.overtimeHours}), 0)`,
        area: sql<string>`coalesce(sum(${timeEntries.executedArea}), 0)`,
        absences: sql<string>`count(*) filter (where ${timeEntries.type} = 'falta')`,
      })
      .from(timeEntries)
      .where(and(eq(timeEntries.employeeId, id), sql`${timeEntries.date} >= ${since}`)),
    db.select({ d: ppeDeliveries, name: ppeItems.name, ca: ppeItems.ca }).from(ppeDeliveries).innerJoin(ppeItems, eq(ppeItems.id, ppeDeliveries.ppeItemId)).where(eq(ppeDeliveries.employeeId, id)).orderBy(desc(ppeDeliveries.deliveredAt)),
    db.select({ t: employeeTrainings, name: trainings.name }).from(employeeTrainings).innerJoin(trainings, eq(trainings.id, employeeTrainings.trainingId)).where(eq(employeeTrainings.employeeId, id)),
  ]);
  const sensitive = can(user, "employees:sensitive");
  const hours = Number(agg.hours);
  return (
    <>
      <PageHeader
        back={{ href: "/equipe/funcionarios", label: "Funcionários" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={e.name} src={e.photoUrl} size={44} />
            {e.name}
          </span>
        }
        description={
          <span className="flex items-center gap-2">
            {e.jobTitle} <Badge tone={EMP_STATUS[e.status].tone}>{EMP_STATUS[e.status].label}</Badge>
          </span>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Dias trabalhados (30 dias)" value={agg.days} />
        <Kpi label="Horas (30 dias)" value={number(hours, 1)} />
        <Kpi label="Horas extras (30 dias)" value={number(Number(agg.overtime), 1)} />
        <Kpi label="m² executados (30 dias)" value={area(Number(agg.area))} />
        <Kpi label="Produtividade" value={hours ? `${number(Number(agg.area) / hours, 2)} m²/h` : "—"} hint="Informação gerencial, não punição" />
      </div>
      <div className="mb-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Ponto (últimos 30 registros)" />
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Obra</Th>
                <Th>Entrada</Th>
                <Th>Intervalo</Th>
                <Th>Saída</Th>
                <Th align="right">Horas</Th>
                <Th align="right">Extras</Th>
                {sensitive && <Th align="right">Custo</Th>}
              </tr>
            </thead>
            <tbody>
              {entries.map(({ t, code }) => (
                <tr key={t.id}>
                  <Td className="tabular">{date(t.date)}</Td>
                  <Td>{t.type === "trabalho" ? (code ?? "—") : <Badge tone="amber">{t.type}</Badge>}</Td>
                  <Td className="tabular">{time(t.clockIn)}</Td>
                  <Td className="tabular">
                    {t.breakStart ? `${time(t.breakStart)}–${time(t.breakEnd)}` : "—"}
                  </Td>
                  <Td className="tabular">{time(t.clockOut)}</Td>
                  <Td align="right">{number(t.workedHours, 2)}</Td>
                  <Td align="right">{number(t.overtimeHours, 2)}</Td>
                  {sensitive && <Td align="right">{money(t.laborCost)}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="EPIs entregues" />
            <ul className="divide-y divide-border">
              {ppe.map(({ d, name, ca }) => (
                <li key={d.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span>
                    {name}
                    <span className="block text-[12px] text-muted">
                      CA {ca}, entregue {date(d.deliveredAt)}
                    </span>
                  </span>
                  {d.nextReplacementAt && <Badge tone={d.nextReplacementAt < today ? "red" : d.nextReplacementAt <= addDays(today, 15) ? "amber" : "green"}>troca {date(d.nextReplacementAt)}</Badge>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Treinamentos e certificados" />
            <ul className="divide-y divide-border">
              {tr.map(({ t, name }) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span>
                    {name}
                    <span className="block text-[12px] text-muted">realizado {date(t.completedAt)}</span>
                  </span>
                  {t.validUntil && <Badge tone={t.validUntil < today ? "red" : t.validUntil <= addDays(today, 30) ? "amber" : "green"}>vale até {date(t.validUntil)}</Badge>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
      {can(user, "employees:edit") && <EmployeeForm employee={e} sensitive={sensitive} />}
    </>
  );
}
