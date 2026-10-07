import type { Metadata } from "next";
import { and, asc, eq, sql } from "drizzle-orm";
import { absenceAction, punchAction } from "../actions";
import { Input, Select, Textarea } from "@/components/ui/form";
import { FormModal, InlineActionButton } from "@/components/ui/form-modal";
import { Avatar, Badge, Card, CardHeader, Kpi, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { PUNCH_LABEL, nextPunch } from "@/domain/timesheet";
import { startOfMonth, todayISO } from "@/domain/dates";
import { number, time } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { employees, timeEntries } from "@/server/db/schema";

export const metadata: Metadata = { title: "Ponto" };

/** Banco de horas simples: horas trabalhadas − (dias úteis trabalhados × 8 h). Configurável na evolução do módulo. */
export default async function PontoPage() {
  const user = await requireUser("timesheet:manage");
  const today = todayISO();
  const from = startOfMonth(today);
  const [emps, todays, month] = await Promise.all([
    db.select().from(employees).where(and(eq(employees.companyId, user.companyId), eq(employees.status, "ativo"))).orderBy(asc(employees.name)),
    db.select().from(timeEntries).innerJoin(employees, eq(employees.id, timeEntries.employeeId)).where(and(eq(employees.companyId, user.companyId), eq(timeEntries.date, today))),
    db
      .select({
        employeeId: timeEntries.employeeId,
        days: sql<string>`count(*) filter (where ${timeEntries.type} = 'trabalho' and ${timeEntries.clockOut} is not null)`,
        hours: sql<string>`coalesce(sum(${timeEntries.workedHours}), 0)`,
        overtime: sql<string>`coalesce(sum(${timeEntries.overtimeHours}), 0)`,
        absences: sql<string>`count(*) filter (where ${timeEntries.type} = 'falta')`,
        medical: sql<string>`count(*) filter (where ${timeEntries.type} = 'atestado')`,
        off: sql<string>`count(*) filter (where ${timeEntries.type} in ('folga','ferias'))`,
      })
      .from(timeEntries)
      .innerJoin(employees, eq(employees.id, timeEntries.employeeId))
      .where(and(eq(employees.companyId, user.companyId), sql`${timeEntries.date} >= ${from}`))
      .groupBy(timeEntries.employeeId),
  ]);
  const byEmp = new Map(todays.map((t) => [t.time_entries.employeeId, t.time_entries]));
  const present = todays.filter((t) => t.time_entries.clockIn && !t.time_entries.clockOut).length;

  return (
    <>
      <PageHeader title="Ponto" description="Batidas de hoje, ausências e resumo do mês. O próprio funcionário bate o ponto pelo celular em Meu dia em campo." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Ativos" value={emps.length} />
        <Kpi label="Trabalhando agora" value={present} tone="info" />
        <Kpi label="Sem batida hoje" value={emps.filter((e) => !byEmp.get(e.id)).length} />
        <Kpi label="Ausências registradas hoje" value={todays.filter((t) => t.time_entries.type !== "trabalho").length} />
      </div>
      <Card className="mb-6">
        <CardHeader title={`Hoje, ${today.split("-").reverse().join("/")}`} />
        <Table>
          <thead>
            <tr>
              <Th>Funcionário</Th>
              <Th>Entrada</Th>
              <Th>Intervalo</Th>
              <Th>Saída</Th>
              <Th align="right">Horas</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {emps.map((e) => {
              const t = byEmp.get(e.id);
              const next = t ? (t.type === "trabalho" ? nextPunch(t) : null) : "clockIn";
              return (
                <tr key={e.id}>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={e.name} size={28} />
                      {e.name}
                    </span>
                  </Td>
                  {t && t.type !== "trabalho" ? (
                    <Td colSpan={4}>
                      <Badge tone="amber">{t.type}</Badge> {t.notes}
                    </Td>
                  ) : (
                    <>
                      <Td className="tabular">{time(t?.clockIn)}</Td>
                      <Td className="tabular">{t?.breakStart ? `${time(t.breakStart)}–${time(t.breakEnd)}` : "—"}</Td>
                      <Td className="tabular">{time(t?.clockOut)}</Td>
                      <Td align="right">{t?.clockOut ? number(t.workedHours, 2) : "—"}</Td>
                    </>
                  )}
                  <Td className="whitespace-nowrap">
                    {next && (
                      <InlineActionButton action={punchAction} fields={{ employeeId: e.id }}>
                        Registrar {PUNCH_LABEL[next].toLowerCase()}
                      </InlineActionButton>
                    )}
                    {!t && (
                      <FormModal trigger="Ausência" title={`Registrar ausência de ${e.name}`} action={absenceAction} variant="ghost" size="sm">
                        <input type="hidden" name="employeeId" value={e.id} />
                        <div className="grid grid-cols-2 gap-3">
                          <Input name="date" type="date" label="Data" defaultValue={today} required />
                          <Select name="type" label="Tipo" options={[{ value: "falta", label: "Falta" }, { value: "atestado", label: "Atestado" }, { value: "folga", label: "Folga" }, { value: "ferias", label: "Férias" }]} />
                        </div>
                        <Textarea name="notes" label="Observação" rows={2} />
                      </FormModal>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Resumo do mês e banco de horas" description="Saldo = horas trabalhadas − 8 h por dia trabalhado." />
        <Table>
          <thead>
            <tr>
              <Th>Funcionário</Th>
              <Th align="right">Dias</Th>
              <Th align="right">Horas</Th>
              <Th align="right">Extras</Th>
              <Th align="right">Faltas</Th>
              <Th align="right">Atestados</Th>
              <Th align="right">Folgas/férias</Th>
              <Th align="right">Banco de horas</Th>
            </tr>
          </thead>
          <tbody>
            {emps.map((e) => {
              const m = month.find((x) => x.employeeId === e.id);
              const bank = m ? Number(m.hours) - Number(m.days) * 8 : 0;
              return (
                <tr key={e.id}>
                  <Td>{e.name}</Td>
                  <Td align="right">{m?.days ?? 0}</Td>
                  <Td align="right">{number(Number(m?.hours ?? 0), 1)}</Td>
                  <Td align="right">{number(Number(m?.overtime ?? 0), 1)}</Td>
                  <Td align="right">{m?.absences ?? 0}</Td>
                  <Td align="right">{m?.medical ?? 0}</Td>
                  <Td align="right">{m?.off ?? 0}</Td>
                  <Td align="right" className={bank < 0 ? "text-danger" : "text-success"}>
                    {bank >= 0 ? "+" : ""}
                    {number(bank, 1)} h
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
