import { Avatar, Badge, Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { area, date, money, number } from "@/lib/format";
import { can, type SessionUser } from "@/server/auth/session";
import { projectTeam } from "@/server/services/project-detail";
import type { Core } from "./types";

export async function TeamTab({ user, core }: { user: SessionUser; core: Core }) {
  const t = await projectTeam(core.p.id);
  const fin = can(user, "projects:finance");
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Equipes alocadas" />
          {t.assignments.length === 0 ? (
            <EmptyState title="Nenhuma equipe alocada" description="Obras com equipe parceira (terceirizada) são custeadas pelas contas a pagar." />
          ) : (
            t.assignments.map(({ a, teamName }) => {
              const members = t.members.filter((m) => m.teamId === a.teamId);
              return (
                <div key={a.id} className="border-b border-border px-5 py-4 last:border-0">
                  <p className="font-medium">{teamName}</p>
                  <p className="text-[12px] text-muted">
                    Desde {date(a.startDate)}
                    {a.endDate ? ` até ${date(a.endDate)}` : ""}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {members.map((m) => (
                      <li key={m.e.id} className="flex items-center gap-2.5 text-sm">
                        <Avatar name={m.e.name} size={28} />
                        <span className="flex-1">{m.e.name}</span>
                        <Badge tone={m.roleInTeam === "encarregado" ? "blue" : "slate"}>{m.roleInTeam}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </Card>
        <Card>
          <CardHeader title="Equipamentos na obra" />
          {t.tools.length === 0 ? (
            <EmptyState title="Nenhum equipamento retirado para esta obra" />
          ) : (
            <ul className="divide-y divide-border">
              {t.tools.map(({ e, holder }) => (
                <li key={e.id} className="px-5 py-3 text-sm">
                  <p className="font-medium">
                    {e.assetTag} {e.name}
                  </p>
                  <p className="text-[12px] text-muted">
                    Com {holder ?? "—"}, devolução prevista {date(e.expectedReturnAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Horas e produção por pessoa" description="Apurado pelo ponto digital nesta obra." />
        {t.hours.length === 0 ? (
          <EmptyState title="Sem registros de ponto nesta obra" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Funcionário</Th>
                <Th align="right">Dias</Th>
                <Th align="right">Horas</Th>
                <Th align="right">Extras</Th>
                <Th align="right">m² executados</Th>
                {fin && <Th align="right">Custo</Th>}
              </tr>
            </thead>
            <tbody>
              {t.hours.map((h) => (
                <tr key={h.employeeId}>
                  <Td>{h.name}</Td>
                  <Td align="right">{h.days}</Td>
                  <Td align="right">{number(Number(h.hours), 1)}</Td>
                  <Td align="right">{number(Number(h.overtime), 1)}</Td>
                  <Td align="right">{area(Number(h.area))}</Td>
                  {fin && <Td align="right">{money(Number(h.cost))}</Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
