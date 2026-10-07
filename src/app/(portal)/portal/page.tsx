import type { Metadata } from "next";
import Image from "next/image";
import { and, asc, eq, inArray } from "drizzle-orm";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";
import { Badge, Card, CardHeader, EmptyState, Progress, Table, Td, Th } from "@/components/ui/primitives";
import { receivableStatus } from "@/domain/receivables";
import { todayISO } from "@/domain/dates";
import { area, date, money, pct } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { accountsReceivable, clients, measurements, projectPhotos, projects, projectStatuses, projectTasks, warranties } from "@/server/db/schema";
import { RECEIVABLE_STATUS } from "@/server/services/finance-lists";
import { loadProjectSummaries } from "@/server/services/project-summary";

export const metadata: Metadata = { title: "Portal do cliente" };

/**
 * Portal do cliente (§50): status, cronograma, fotos, medições, parcelas e garantia.
 * NUNCA expõe custos, margens ou dados internos — as consultas abaixo só leem
 * dados do próprio cliente e o resumo usado é filtrado para campos públicos.
 */
export default async function PortalPage() {
  const user = await requireUser("portal:view");
  if (!user.clientId) {
    return <main className="mx-auto max-w-lg p-10 text-center text-sm">Seu usuário não está vinculado a um cliente. Fale com a Revolution Imper.</main>;
  }
  const today = todayISO();
  const [client] = await db.select().from(clients).where(and(eq(clients.id, user.clientId), eq(clients.companyId, user.companyId))).limit(1);
  const projectRows = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(projectStatuses, eq(projectStatuses.id, projects.statusId))
    .where(and(eq(projects.clientId, user.clientId), eq(projects.companyId, user.companyId)));
  const ids = projectRows.map((p) => p.id);
  const summaries = ids.length ? await loadProjectSummaries(user.companyId, { projectIds: ids }) : [];
  const [ar, photos, ms, tasks, ws] = ids.length
    ? await Promise.all([
        db.select().from(accountsReceivable).where(and(eq(accountsReceivable.clientId, user.clientId), eq(accountsReceivable.cancelled, false), eq(accountsReceivable.forecast, false))).orderBy(asc(accountsReceivable.dueDate)),
        db.select().from(projectPhotos).where(inArray(projectPhotos.projectId, ids)).orderBy(asc(projectPhotos.takenAt)),
        db.select().from(measurements).where(inArray(measurements.projectId, ids)).orderBy(asc(measurements.number)),
        db.select().from(projectTasks).where(inArray(projectTasks.projectId, ids)).orderBy(asc(projectTasks.position)),
        db.select().from(warranties).where(inArray(warranties.projectId, ids)),
      ])
    : [[], [], [], [], []];

  return (
    <div className="min-h-dvh">
      <header className="bg-abyss text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <span className="rounded-lg bg-white p-1">
            <Image src="/brand/logo.png" alt="Revolution Imper" width={40} height={34} />
          </span>
          <div className="flex-1">
            <p className="font-display text-lg font-semibold">Portal do cliente</p>
            <p className="text-[12px] text-white/70">{client?.name}</p>
          </div>
          <form action={logoutAction}>
            <button className="rounded-lg p-2 text-white/80 hover:bg-white/10" aria-label="Sair">
              <LogOut className="size-5" />
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {summaries.length === 0 && (
          <Card>
            <EmptyState title="Nenhuma obra vinculada" />
          </Card>
        )}
        {summaries.map((p) => {
          const myPhotos = photos.filter((x) => x.projectId === p.id);
          const myTasks = tasks.filter((t) => t.projectId === p.id);
          const myMs = ms.filter((m) => m.projectId === p.id && ["aprovada", "faturada", "recebida"].includes(m.status));
          const myW = ws.filter((w) => w.projectId === p.id);
          return (
            <Card key={p.id}>
              <CardHeader title={p.name} description={`${p.code}${p.city ? `, ${p.city}` : ""}`} actions={<Badge tone={p.statusColor}>{p.statusLabel}</Badge>} />
              <div className="grid gap-6 p-5 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted">Avanço da obra</p>
                  <p className="font-display text-4xl font-semibold">{pct(p.physicalProgress * 100, 0)}</p>
                  <Progress value={p.physicalProgress * 100} className="mt-2" />
                  <p className="mt-2 text-sm text-muted">
                    {area(p.executedArea)} de {area(p.contractedArea)}. Previsão de término: {date(p.statusCategory === "concluida" || p.statusCategory === "garantia" ? p.actualEnd : (p.forecast.forecastEnd ?? p.adjustedPlannedEnd))}.
                  </p>
                  <p className="mt-4 text-sm font-medium">Cronograma</p>
                  <ul className="mt-1 space-y-1.5 text-sm">
                    {myTasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-3">
                        <span className="flex-1">{t.name}</span>
                        <span className="w-12 text-right tabular text-muted">{Number(t.progress)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-sm font-medium">Fotos recentes</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {myPhotos.slice(-6).map((ph) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={ph.id} src={ph.fileId ? `/api/files/${ph.fileId}` : (ph.url ?? "")} alt={ph.caption ?? ph.stage} className="aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />
                    ))}
                  </div>
                  {myMs.length > 0 && (
                    <>
                      <p className="mt-4 text-sm font-medium">Medições</p>
                      <ul className="text-sm">
                        {myMs.map((m) => (
                          <li key={m.id} className="flex justify-between py-0.5">
                            <span>
                              Medição {m.number} ({date(m.periodEnd)})
                            </span>
                            <span className="tabular">{money(m.netValue)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {myW.length > 0 && (
                    <p className="mt-4 text-sm">
                      <strong>Garantia</strong> válida até {date(myW[0].endsAt)}.
                    </p>
                  )}
                  {(p.statusCategory === "concluida" || p.statusCategory === "garantia") && (
                    <a href={`/impressao/obra/${p.id}/relatorio`} className="mt-3 inline-block text-sm font-medium text-primary underline">
                      Relatório final da obra
                    </a>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
        {ar.length > 0 && (
          <Card>
            <CardHeader title="Parcelas e pagamentos" />
            <Table>
              <thead>
                <tr>
                  <Th>Vencimento</Th>
                  <Th>Descrição</Th>
                  <Th align="right">Valor</Th>
                  <Th>Situação</Th>
                </tr>
              </thead>
              <tbody>
                {ar.map((r) => {
                  const st = receivableStatus(r, today);
                  return (
                    <tr key={r.id}>
                      <Td className="tabular">{date(r.dueDate)}</Td>
                      <Td>{r.description}</Td>
                      <Td align="right">{money(r.amount - r.discount + r.interest)}</Td>
                      <Td>
                        <Badge tone={RECEIVABLE_STATUS[st].tone}>{st === "recebido" ? "Pago" : RECEIVABLE_STATUS[st].label}</Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        )}
      </main>
    </div>
  );
}
