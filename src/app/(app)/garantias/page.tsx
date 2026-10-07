import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { serviceRequestAction, updateServiceRequestAction } from "./actions";
import { Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardHeader, EmptyState, Kpi, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { addDays, todayISO } from "@/domain/dates";
import { date, money } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { clients, projects, serviceRequests, warranties, waterproofingSystems } from "@/server/db/schema";
import { financeOptions } from "@/server/services/options";

export const metadata: Metadata = { title: "Garantias e pós-venda" };
const KIND: Record<string, string> = { garantia: "Garantia", manutencao: "Manutenção", novo_servico: "Novo serviço" };
const ST: Record<string, { label: string; tone: string }> = {
  aberta: { label: "Aberta", tone: "red" },
  visita_agendada: { label: "Visita agendada", tone: "amber" },
  em_atendimento: { label: "Em atendimento", tone: "blue" },
  resolvida: { label: "Resolvida", tone: "green" },
  improcedente: { label: "Improcedente", tone: "slate" },
};

export default async function GarantiasPage() {
  const user = await requireUser("projects:view");
  const today = todayISO();
  const [ws, reqs, opts] = await Promise.all([
    db
      .select({ w: warranties, code: projects.code, projectName: projects.name, projectId: projects.id, client: clients.name, systemName: waterproofingSystems.name })
      .from(warranties)
      .innerJoin(projects, eq(projects.id, warranties.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(waterproofingSystems, eq(waterproofingSystems.id, warranties.systemId))
      .where(eq(projects.companyId, user.companyId))
      .orderBy(asc(warranties.endsAt)),
    db
      .select({ r: serviceRequests, client: clients.name, code: projects.code })
      .from(serviceRequests)
      .innerJoin(clients, eq(clients.id, serviceRequests.clientId))
      .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
      .where(eq(serviceRequests.companyId, user.companyId))
      .orderBy(desc(serviceRequests.openedAt)),
    financeOptions(user.companyId),
  ]);
  const active = ws.filter((w) => w.w.endsAt >= today);
  const edit = can(user, "projects:edit");
  return (
    <>
      <PageHeader
        title="Garantias e pós-venda"
        description="Garantias nascem na assinatura do termo de entrega. Chamados diferenciam garantia, manutenção e novo serviço."
        actions={
          edit && (
            <FormModal trigger="Abrir chamado" title="Novo chamado de pós-venda" action={serviceRequestAction}>
              <Select name="clientId" label="Cliente" required placeholder="Selecione" options={opts.clients} />
              <Select name="projectId" label="Obra" placeholder="—" options={opts.projects} />
              <Select name="kind" label="Tipo" options={Object.entries(KIND).map(([v, l]) => ({ value: v, label: l }))} defaultValue="garantia" />
              <Textarea name="problem" label="Problema relatado" required />
              <Input name="visitAt" type="date" label="Visita agendada para" />
            </FormModal>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Garantias vigentes" value={active.length} />
        <Kpi label="Vencem em 60 dias" value={active.filter((w) => w.w.endsAt <= addDays(today, 60)).length} tone="warning" />
        <Kpi label="Chamados abertos" value={reqs.filter((r) => !["resolvida", "improcedente"].includes(r.r.status)).length} />
        <Kpi label="Custo de garantia" value={money(reqs.filter((r) => r.r.kind === "garantia").reduce((s, r) => s + r.r.cost, 0))} />
      </div>
      <Card className="mb-6">
        <CardHeader title="Chamados" />
        {reqs.length === 0 ? (
          <EmptyState title="Nenhum chamado" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Aberto</Th>
                <Th>Cliente / obra</Th>
                <Th>Tipo</Th>
                <Th>Problema</Th>
                <Th>Visita</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {reqs.map(({ r, client, code }) => (
                <tr key={r.id}>
                  <Td className="tabular">{date(r.openedAt)}</Td>
                  <Td>
                    {client}
                    {code && <p className="text-[12px] text-muted">{code}</p>}
                  </Td>
                  <Td>{KIND[r.kind]}</Td>
                  <Td className="max-w-md">
                    {r.problem}
                    {r.solution && <p className="text-[12px] text-muted">Solução: {r.solution}</p>}
                  </Td>
                  <Td className="tabular">{date(r.visitAt)}</Td>
                  <Td>
                    <Badge tone={ST[r.status].tone}>{ST[r.status].label}</Badge>
                  </Td>
                  <Td>
                    {edit && (
                      <FormModal trigger="Atualizar" title="Atualizar chamado" action={updateServiceRequestAction} variant="secondary" size="sm">
                        <input type="hidden" name="id" value={r.id} />
                        <Select name="status" label="Status" defaultValue={r.status} options={Object.entries(ST).map(([v, s]) => ({ value: v, label: s.label }))} />
                        <Input name="visitAt" type="date" label="Visita" defaultValue={r.visitAt ?? ""} />
                        <Textarea name="solution" label="Solução" defaultValue={r.solution ?? ""} />
                        <MoneyInput name="cost" label="Custo do atendimento" defaultValue={r.cost ? String(r.cost).replace(".", ",") : ""} />
                      </FormModal>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Garantias" />
        {ws.length === 0 ? (
          <EmptyState title="Nenhuma garantia registrada" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Obra</Th>
                <Th>Cliente</Th>
                <Th>Serviço</Th>
                <Th>Sistema</Th>
                <Th>Início</Th>
                <Th>Fim</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {ws.map(({ w, code, projectId, client, systemName }) => (
                <tr key={w.id}>
                  <Td>
                    <Link href={`/obras/${projectId}?tab=garantia`} className="hover:text-primary">
                      {code}
                    </Link>
                  </Td>
                  <Td>{client}</Td>
                  <Td>{w.service}</Td>
                  <Td>{systemName ?? "—"}</Td>
                  <Td className="tabular">{date(w.startsAt)}</Td>
                  <Td className="tabular">{date(w.endsAt)}</Td>
                  <Td>{w.endsAt < today ? <Badge tone="slate">Encerrada</Badge> : w.endsAt <= addDays(today, 60) ? <Badge tone="amber">Vence em breve</Badge> : <Badge tone="teal">Vigente</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
