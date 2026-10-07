import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { FilterBar } from "@/components/ui/filter-bar";
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { formatPhone } from "@/domain/br";
import { date, money } from "@/lib/format";
import { EMP_STATUS } from "@/lib/labels";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { employees } from "@/server/db/schema";

export const metadata: Metadata = { title: "Funcionários" };

export default async function FuncionariosPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; cargo?: string }> }) {
  const user = await requireUser("employees:view");
  const f = await searchParams;
  const rows = await db
    .select({
      e: employees,
      team: sql<string | null>`(select t.name from team_members tm join teams t on t.id = tm.team_id where tm.employee_id = "employees"."id" limit 1)`,
      project: sql<string | null>`(select pr.code from team_members tm join project_team_assignments pta on pta.team_id = tm.team_id and pta.end_date is null join projects pr on pr.id = pta.project_id where tm.employee_id = "employees"."id" limit 1)`,
    })
    .from(employees)
    .where(and(eq(employees.companyId, user.companyId), f.q ? ilike(employees.name, `%${f.q}%`) : undefined, f.status ? eq(employees.status, f.status as "ativo") : undefined, f.cargo ? eq(employees.jobTitle, f.cargo) : undefined))
    .orderBy(asc(employees.name));
  const sensitive = can(user, "employees:sensitive");
  return (
    <>
      <PageHeader
        title="Funcionários"
        actions={
          <>
            <LinkButton href="/api/export/funcionarios" variant="secondary" prefetch={false}>
              Exportar Excel/CSV
            </LinkButton>
            {can(user, "employees:edit") && <LinkButton href="/equipe/funcionarios/novo">Novo funcionário</LinkButton>}
          </>
        }
      />
      <FilterBar
        fields={[
          { name: "q", label: "Buscar", type: "search", placeholder: "Nome" },
          { name: "status", label: "Situação", type: "select", options: Object.entries(EMP_STATUS).map(([v, s]) => ({ value: v, label: s.label })) },
          { name: "cargo", label: "Cargo", type: "select", options: ["Encarregado", "Aplicador", "Ajudante", "Supervisor"].map((v) => ({ value: v, label: v })) },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Nenhum funcionário" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Cargo</Th>
                <Th>Equipe / obra atual</Th>
                <Th>Telefone</Th>
                <Th>Admissão</Th>
                {sensitive && <Th align="right">Valor hora</Th>}
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, team, project }) => (
                <tr key={e.id}>
                  <Td>
                    <Link href={`/equipe/funcionarios/${e.id}`} className="flex items-center gap-2.5 font-medium hover:text-primary">
                      <Avatar name={e.name} src={e.photoUrl} size={30} />
                      {e.name}
                    </Link>
                  </Td>
                  <Td>
                    {e.jobTitle}
                    <p className="text-[12px] uppercase text-muted">{e.employmentType}</p>
                  </Td>
                  <Td>
                    {team ?? "—"}
                    {project && <p className="text-[12px] text-muted">{project}</p>}
                  </Td>
                  <Td className="tabular">{formatPhone(e.phone)}</Td>
                  <Td className="tabular">{date(e.admissionDate)}</Td>
                  {sensitive && <Td align="right">{money(e.hourlyRate)}</Td>}
                  <Td>
                    <Badge tone={EMP_STATUS[e.status].tone}>{EMP_STATUS[e.status].label}</Badge>
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
