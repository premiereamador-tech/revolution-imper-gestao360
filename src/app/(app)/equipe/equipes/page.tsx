import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { addMemberAction, assignTeamAction, createTeamAction, removeMemberAction } from "../actions";
import { Input, Select } from "@/components/ui/form";
import { FormModal, InlineActionButton } from "@/components/ui/form-modal";
import { Avatar, Badge, Card, CardHeader, Kpi, PageHeader } from "@/components/ui/primitives";
import { addDays, todayISO } from "@/domain/dates";
import { area, date, money, number } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { employees, projects, projectTeamAssignments, teamMembers, teams } from "@/server/db/schema";
import { teamProductivity } from "@/server/services/insights";
import { projectsForSelect } from "@/server/services/projects";

export const metadata: Metadata = { title: "Equipes" };

export default async function EquipesPage() {
  const user = await requireUser("employees:view");
  const today = todayISO();
  const [teamList, members, current, emps, prod, projectOpts] = await Promise.all([
    db.select().from(teams).where(eq(teams.companyId, user.companyId)).orderBy(asc(teams.name)),
    db.select({ teamId: teamMembers.teamId, role: teamMembers.roleInTeam, e: employees }).from(teamMembers).innerJoin(employees, eq(employees.id, teamMembers.employeeId)),
    db
      .select({ a: projectTeamAssignments, code: projects.code, name: projects.name })
      .from(projectTeamAssignments)
      .innerJoin(projects, eq(projects.id, projectTeamAssignments.projectId))
      .where(and(eq(projects.companyId, user.companyId), isNull(projectTeamAssignments.endDate))),
    db.select({ id: employees.id, name: employees.name }).from(employees).where(and(eq(employees.companyId, user.companyId), eq(employees.status, "ativo"))).orderBy(asc(employees.name)),
    teamProductivity(user.companyId, addDays(today, -30)),
    projectsForSelect(user.companyId),
  ]);
  const editable = can(user, "employees:edit");
  const fin = can(user, "projects:finance");

  return (
    <>
      <PageHeader
        title="Equipes"
        description="Qual equipe está em qual obra, desde quando, quanto produz e quanto custa."
        actions={
          editable && (
            <FormModal trigger="Nova equipe" title="Nova equipe" action={createTeamAction}>
              <Input name="name" label="Nome" placeholder="Equipe D" required />
              <Select name="foremanId" label="Encarregado" placeholder="Selecione" options={emps.map((e) => ({ value: e.id, label: e.name }))} />
            </FormModal>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        {teamList.map((t) => {
          const ms = members.filter((m) => m.teamId === t.id);
          const assign = current.filter((c) => c.a.teamId === t.id);
          const p = prod.find((x) => x.id === t.id);
          const hourly = ms.reduce((s, m) => s + m.e.hourlyRate, 0);
          const days = assign[0] ? Math.max(Math.round((Date.parse(today) - Date.parse(assign[0].a.startDate)) / 86_400_000), 0) : 0;
          return (
            <Card key={t.id}>
              <CardHeader
                title={t.name}
                description={assign.length ? assign.map((a) => `${a.code} ${a.name}`).join("; ") : "Sem obra no momento"}
                actions={
                  editable && (
                    <FormModal trigger="Alocar em obra" title={`Alocar ${t.name}`} description="Encerra a alocação atual da equipe." action={assignTeamAction} variant="secondary" size="sm">
                      <input type="hidden" name="teamId" value={t.id} />
                      <Select name="projectId" label="Obra" required placeholder="Selecione" options={projectOpts.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))} />
                      <Input name="startDate" type="date" label="A partir de" defaultValue={today} required />
                    </FormModal>
                  )
                }
              />
              <div className="grid grid-cols-3 gap-px border-b border-border bg-border">
                <div className="bg-surface px-4 py-3">
                  <p className="text-[12px] text-muted">Na obra há</p>
                  <p className="font-display text-xl font-semibold">{assign[0] ? `${days} dias` : "—"}</p>
                  {assign[0] && <p className="text-[11px] text-muted">desde {date(assign[0].a.startDate)}</p>}
                </div>
                <div className="bg-surface px-4 py-3">
                  <p className="text-[12px] text-muted">m² em 30 dias</p>
                  <p className="font-display text-xl font-semibold">{area(p?.area)}</p>
                  <p className="text-[11px] text-muted">{p?.areaPerDay ? `${number(p.areaPerDay, 1)} m²/dia` : "—"}</p>
                </div>
                <div className="bg-surface px-4 py-3">
                  <p className="text-[12px] text-muted">Custo/dia</p>
                  <p className="font-display text-xl font-semibold">{fin ? money(hourly * 9) : "—"}</p>
                  <p className="text-[11px] text-muted">jornada de 9 h</p>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {ms.map((m) => (
                  <li key={m.e.id} className="flex items-center gap-2.5 px-5 py-2.5 text-sm">
                    <Avatar name={m.e.name} size={28} />
                    <Link href={`/equipe/funcionarios/${m.e.id}`} className="flex-1 hover:text-primary">
                      {m.e.name}
                    </Link>
                    <Badge tone={m.role === "encarregado" ? "blue" : "slate"}>{m.role}</Badge>
                    {editable && (
                      <InlineActionButton action={removeMemberAction} fields={{ teamId: t.id, employeeId: m.e.id }} variant="ghost" confirm={`Remover ${m.e.name} da ${t.name}?`}>
                        Remover
                      </InlineActionButton>
                    )}
                  </li>
                ))}
              </ul>
              {editable && (
                <div className="border-t border-border px-5 py-3">
                  <FormModal trigger="Adicionar membro" title={`Adicionar à ${t.name}`} action={addMemberAction} variant="ghost" size="sm">
                    <input type="hidden" name="teamId" value={t.id} />
                    <Select name="employeeId" label="Funcionário" required placeholder="Selecione" options={emps.map((e) => ({ value: e.id, label: e.name }))} />
                    <Select name="roleInTeam" label="Papel" defaultValue="aplicador" options={[{ value: "encarregado", label: "Encarregado" }, { value: "aplicador", label: "Aplicador" }, { value: "ajudante", label: "Ajudante" }]} />
                  </FormModal>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {teamList.length === 0 && <Kpi label="Equipes" value={0} />}
    </>
  );
}
