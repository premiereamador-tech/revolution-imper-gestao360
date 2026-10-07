import { taskProgressAction } from "../../actions";
import { SCurveChart } from "@/components/charts/charts";
import { Gantt } from "@/components/domain/gantt";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardHeader } from "@/components/ui/primitives";
import { shortDate } from "@/lib/format";
import { can } from "@/server/auth/session";
import { projectSchedule, sCurve } from "@/server/services/project-detail";
import type { TabProps } from "./types";

export async function ScheduleTab({ user, core, summary }: TabProps) {
  const { tasks } = await projectSchedule(core.p.id);
  const curve = await sCurve(core.p.id, core.p.plannedStart, summary.adjustedPlannedEnd, summary.contractedArea, summary.finance.projectedCost);
  const names = new Map(tasks.map((t) => [t.id, t.name]));
  const editable = can(user, "projects:edit");
  const last = [...curve].reverse().find((c) => c.actual !== null);
  const deviation = last && last.actual !== null ? last.actual - last.planned : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Cronograma (Gantt)" description="Barras vermelhas: etapa atrasada ou abaixo do avanço esperado para hoje. Linha azul-clara: hoje." />
        <Gantt
          tasks={tasks.map((t) => ({ ...t, dependsOnName: t.dependsOnTaskId ? names.get(t.dependsOnTaskId) : null }))}
          renderActions={
            editable
              ? (t) => (
                  <ActionForm action={taskProgressAction} className="flex items-center gap-1.5" successMessage={false}>
                    <input type="hidden" name="taskId" value={t.id} />
                    <input type="hidden" name="projectId" value={core.p.id} />
                    <label className="sr-only" htmlFor={`p-${t.id}`}>
                      Percentual concluído
                    </label>
                    <input id={`p-${t.id}`} name="progress" type="number" min={0} max={100} defaultValue={t.progress} className="h-7 w-16 rounded-md border border-border px-2 text-[12px] tabular" />
                    <span className="text-[12px] text-muted">%</span>
                    <SubmitButton size="sm" variant="ghost" className="h-7 px-2 text-[12px]" pendingLabel="…">
                      Atualizar
                    </SubmitButton>
                  </ActionForm>
                )
              : undefined
          }
        />
      </Card>

      <Card>
        <CardHeader
          title="Curva S físico-financeira"
          description={
            deviation === null
              ? "Planejado × realizado."
              : `Desvio físico hoje: ${deviation > 0 ? "+" : ""}${deviation.toFixed(1)} pontos percentuais ${deviation < 0 ? "(abaixo do planejado)" : "(acima do planejado)"}.`
          }
        />
        <div className="p-4">
          <SCurveChart data={curve.map((c) => ({ ...c, label: shortDate(c.date) }))} />
        </div>
      </Card>
    </div>
  );
}
