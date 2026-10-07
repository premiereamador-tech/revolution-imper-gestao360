import { nowLocalInput } from "@/domain/dates";
import { randomUUID } from "node:crypto";
import { createNonconformityAction, tightnessTestAction, updateNcStatusAction } from "../../actions";
import { Checkbox, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { addDays, todayISO } from "@/domain/dates";
import { date, dateTime, money } from "@/lib/format";
import { can, type SessionUser } from "@/server/auth/session";
import { projectAreasWithApps, projectQuality } from "@/server/services/project-detail";
import type { Core } from "./types";

export const SEVERITY: Record<string, { label: string; tone: string }> = {
  baixa: { label: "Baixa", tone: "slate" },
  media: { label: "Média", tone: "amber" },
  alta: { label: "Alta", tone: "red" },
  critica: { label: "Crítica", tone: "red" },
};
export const NC_STATUS: Record<string, { label: string; tone: string }> = {
  aberta: { label: "Aberta", tone: "red" },
  em_tratamento: { label: "Em tratamento", tone: "amber" },
  resolvida: { label: "Resolvida", tone: "green" },
  cancelada: { label: "Cancelada", tone: "slate" },
};

export async function QualityTab({ user, core }: { user: SessionUser; core: Core }) {
  const [q, areas] = await Promise.all([projectQuality(core.p.id), projectAreasWithApps(core.p.id)]);
  const editable = can(user, "quality:edit");
  const now = nowLocalInput();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Não conformidades e retrabalho"
          description={`${q.ncs.filter((n) => n.nc.status === "aberta" || n.nc.status === "em_tratamento").length} em aberto. Custo estimado de retrabalho: ${money(q.ncs.reduce((s, n) => s + n.nc.estimatedReworkCost, 0))}.`}
          actions={
            editable && (
              <FormModal trigger="Registrar ocorrência" title="Nova não conformidade" action={createNonconformityAction} size="sm">
                <input type="hidden" name="projectId" value={core.p.id} />
                <input type="hidden" name="clientUuid" value={randomUUID()} />
                <Input name="title" label="O que aconteceu" required />
                <Textarea name="description" label="Detalhes" />
                <div className="grid grid-cols-2 gap-3">
                  <Select name="severity" label="Gravidade" options={Object.entries(SEVERITY).map(([v, s]) => ({ value: v, label: s.label }))} defaultValue="media" />
                  <Select name="areaId" label="Área" options={areas.map((a) => ({ value: a.id, label: a.name }))} placeholder="Geral" />
                  <Input name="cause" label="Causa provável" />
                  <Input name="dueDate" type="date" label="Prazo para correção" defaultValue={addDays(todayISO(), 7)} />
                  <MoneyInput name="estimatedReworkCost" label="Custo estimado do retrabalho" />
                </div>
                <Textarea name="correctiveAction" label="Ação corretiva" rows={2} />
                <Checkbox name="isRework" label="Exige retrabalho" defaultChecked />
              </FormModal>
            )
          }
        />
        {q.ncs.length === 0 ? (
          <EmptyState title="Nenhuma não conformidade registrada" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Detectada</Th>
                <Th>Ocorrência</Th>
                <Th>Gravidade</Th>
                <Th>Equipe / responsável</Th>
                <Th>Prazo</Th>
                <Th align="right">Retrabalho</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {q.ncs.map(({ nc, areaName, responsible, teamName }) => (
                <tr key={nc.id}>
                  <Td className="tabular">{date(nc.detectedAt)}</Td>
                  <Td className="min-w-64">
                    <p className="font-medium">{nc.title}</p>
                    <p className="text-[12px] text-muted">
                      {areaName ?? "Geral"}
                      {nc.cause ? `, causa: ${nc.cause}` : ""}
                      {nc.source === "teste_estanqueidade" ? ", aberta pelo teste de estanqueidade" : ""}
                    </p>
                    {nc.correctiveAction && <p className="mt-1 text-[12px]">Ação: {nc.correctiveAction}</p>}
                  </Td>
                  <Td>
                    <Badge tone={SEVERITY[nc.severity].tone}>{SEVERITY[nc.severity].label}</Badge>
                  </Td>
                  <Td className="text-[13px]">{[teamName, responsible].filter(Boolean).join(" / ") || "—"}</Td>
                  <Td className={nc.dueDate && nc.dueDate < todayISO() && nc.status !== "resolvida" ? "text-danger" : ""}>{date(nc.dueDate)}</Td>
                  <Td align="right">{money(nc.estimatedReworkCost)}</Td>
                  <Td>
                    <Badge tone={NC_STATUS[nc.status].tone}>{NC_STATUS[nc.status].label}</Badge>
                  </Td>
                  <Td>
                    {editable && nc.status !== "resolvida" && nc.status !== "cancelada" && (
                      <FormModal trigger="Atualizar" title="Atualizar não conformidade" action={updateNcStatusAction} variant="secondary" size="sm">
                        <input type="hidden" name="id" value={nc.id} />
                        <input type="hidden" name="projectId" value={core.p.id} />
                        <Select name="status" label="Status" options={Object.entries(NC_STATUS).map(([v, s]) => ({ value: v, label: s.label }))} defaultValue={nc.status === "aberta" ? "em_tratamento" : "resolvida"} />
                        <Textarea name="correctiveAction" label="Ação corretiva executada" defaultValue={nc.correctiveAction ?? ""} />
                      </FormModal>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Testes de estanqueidade"
            description="Reprovado abre não conformidade automaticamente."
            actions={
              editable && (
                <FormModal trigger="Registrar teste" title="Teste de estanqueidade" action={tightnessTestAction} size="sm">
                  <input type="hidden" name="projectId" value={core.p.id} />
                  <Select name="areaId" label="Área testada" options={areas.map((a) => ({ value: a.id, label: a.name }))} placeholder="Selecione" />
                  <div className="grid grid-cols-2 gap-3">
                    <Input name="startedAt" type="datetime-local" label="Início" defaultValue={now} required />
                    <Input name="endedAt" type="datetime-local" label="Término" />
                  </div>
                  <Textarea name="initialCondition" label="Condição inicial" rows={2} placeholder="Ex.: lâmina d'água de 5 cm, ralos tamponados" />
                  <Textarea name="result" label="Resultado observado" rows={2} />
                  <Select name="approved" label="Resultado" options={[{ value: "sim", label: "Aprovado" }, { value: "nao", label: "Reprovado" }]} defaultValue="sim" />
                </FormModal>
              )
            }
          />
          {q.tests.length === 0 ? (
            <EmptyState title="Nenhum teste registrado" />
          ) : (
            <ul className="divide-y divide-border">
              {q.tests.map(({ t, areaName, responsible }) => {
                const hours = t.endedAt ? Math.round((t.endedAt.getTime() - t.startedAt.getTime()) / 3_600_000) : null;
                return (
                  <li key={t.id} className="px-5 py-3.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{areaName ?? "Área geral"}</p>
                      <Badge tone={t.approved ? "green" : "red"}>{t.approved ? "Aprovado" : "Reprovado"}</Badge>
                    </div>
                    <p className="text-[12px] text-muted">
                      {dateTime(t.startedAt)} a {dateTime(t.endedAt)}
                      {hours !== null ? ` (${hours} h)` : ""}, {responsible ?? "—"}
                    </p>
                    {t.initialCondition && <p className="mt-1 text-[13px]">Condição: {t.initialCondition}</p>}
                    {t.result && <p className="text-[13px]">Resultado: {t.result}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Checklists de liberação de etapa" description="Modelos configuráveis em Configurações." />
          {q.checklists.length === 0 ? (
            <EmptyState title="Nenhum checklist nesta obra" />
          ) : (
            <ul className="divide-y divide-border">
              {q.checklists.map(({ c, templateName, areaName, filledBy }) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
                  <div>
                    <p className="font-medium">{templateName}</p>
                    <p className="text-[12px] text-muted">
                      {areaName ?? "Geral"}, {filledBy ?? "não preenchido"}, {c.completedAt ? dateTime(c.completedAt) : "pendente"}
                    </p>
                  </div>
                  <Badge tone={c.status === "aprovado" ? "green" : c.status === "reprovado" ? "red" : "amber"}>{c.status === "aberto" ? "Pendente" : c.status === "aprovado" ? "Liberado" : "Reprovado"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
