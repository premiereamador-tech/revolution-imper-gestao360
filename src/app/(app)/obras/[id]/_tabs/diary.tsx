import { randomUUID } from "node:crypto";
import { createDailyLogAction } from "../../actions";
import { ActionForm, Checkbox, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/primitives";
import { todayISO } from "@/domain/dates";
import { area, date, number } from "@/lib/format";
import { can, type SessionUser } from "@/server/auth/session";
import { projectAreasWithApps, projectDailyLogs } from "@/server/services/project-detail";
import type { Core } from "./types";

export const WEATHER = ["Ensolarado", "Parcialmente nublado", "Nublado", "Chuva leve", "Chuva forte", "Chuva leve à tarde"];

export async function DiaryTab({ user, core }: { user: SessionUser; core: Core }) {
  const [logs, areas] = await Promise.all([projectDailyLogs(core.p.id), projectAreasWithApps(core.p.id)]);
  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader title="Histórico do diário de obra" description={`${logs.length} registro(s) mais recentes`} />
        {logs.length === 0 ? (
          <EmptyState title="Nenhum diário ainda" description="O encarregado registra o dia pelo celular, em Meu dia em campo." />
        ) : (
          <ol className="divide-y divide-border">
            {logs.map(({ l, areaName, author }) => (
              <li key={l.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[110px_1fr]">
                <div>
                  <p className="font-display text-lg font-semibold tabular">{date(l.date)}</p>
                  <p className="text-[12px] text-muted">{l.weather}</p>
                </div>
                <div className="min-w-0 text-sm">
                  <p className="text-text">{l.activities ?? "Sem descrição de atividades."}</p>
                  <p className="mt-1 text-[12px] text-muted">
                    {l.workersPresent} pessoas, {number(l.hoursWorked)} h trabalhadas
                    {l.executedArea > 0 && `, ${area(l.executedArea)} em ${areaName ?? "área não informada"}`}
                  </p>
                  {[["Interferências", l.interferences], ["Atrasos", l.delays], ["Visitas", l.visits], ["Ocorrências", l.occurrences], ["Equipamentos", l.equipmentUsed], ["Observações", l.notes]]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <p key={k} className="mt-1 text-[13px]">
                        <span className="text-muted">{k}:</span> {v}
                      </p>
                    ))}
                  <p className="mt-1.5 text-[11px] text-muted">
                    Registrado por {author ?? "—"}
                    {l.signedAt ? ", assinado digitalmente" : ", sem assinatura"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {can(user, "field:use") && (
        <Card className="h-fit">
          <CardHeader title="Registrar dia" description="Os m² executados atualizam o avanço da área automaticamente." />
          <CardBody>
            <ActionForm action={createDailyLogAction} className="space-y-3" resetOnSuccess>
              <input type="hidden" name="projectId" value={core.p.id} />
              <input type="hidden" name="clientUuid" value={randomUUID()} />
              <div className="grid grid-cols-2 gap-3">
                <Input name="date" type="date" label="Data" defaultValue={todayISO()} max={todayISO()} required />
                <Select name="weather" label="Clima" options={WEATHER.map((w) => ({ value: w, label: w }))} placeholder="Selecione" />
                <Input name="workersPresent" type="number" min={0} label="Pessoas presentes" defaultValue="0" required />
                <Input name="hoursWorked" inputMode="decimal" label="Horas trabalhadas (total)" defaultValue="0" required />
                <Input name="executedArea" inputMode="decimal" label="Área executada (m²)" defaultValue="0" />
                <Select name="areaId" label="Em qual área" options={areas.map((a) => ({ value: a.id, label: a.name }))} placeholder="Selecione" />
              </div>
              <Textarea name="activities" label="Atividades executadas" />
              <Textarea name="interferences" label="Interferências e atrasos" rows={2} />
              <Textarea name="occurrences" label="Ocorrências e visitas" rows={2} />
              <Textarea name="notes" label="Observações" rows={2} />
              <Checkbox name="sign" label="Assinar digitalmente como responsável" defaultChecked />
              <SubmitButton className="w-full">Salvar diário</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
