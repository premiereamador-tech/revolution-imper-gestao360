import type { ReactNode } from "react";
import { diffDays, todayISO, addDays } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { date, shortDate } from "@/lib/format";

export interface GanttTask {
  id: string;
  name: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  progress: number;
  responsible?: string | null;
  dependsOnName?: string | null;
}

/** Gantt leve (HTML/CSS): barra planejada, preenchimento pelo % concluído, linha de hoje e atraso. */
export function Gantt({ tasks, renderActions }: { tasks: GanttTask[]; renderActions?: (t: GanttTask) => ReactNode }) {
  if (!tasks.length) return <p className="px-5 py-6 text-sm text-muted">Nenhuma tarefa no cronograma.</p>;
  const today = todayISO();
  const start = tasks.reduce((m, t) => (t.plannedStart < m ? t.plannedStart : m), tasks[0].plannedStart);
  const end = tasks.reduce((m, t) => (t.plannedEnd > m ? t.plannedEnd : m), tasks[0].plannedEnd);
  const from = addDays(start, -2);
  const to = addDays(end > today ? end : today, 3);
  const total = Math.max(diffDays(from, to), 1);
  const pos = (d: string) => `${(diffDays(from, d) / total) * 100}%`;
  const ticks: string[] = [];
  const step = Math.max(Math.round(total / 8), 1);
  for (let i = 0; i <= total; i += step) ticks.push(addDays(from, i));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid grid-cols-[260px_1fr] border-b border-border bg-surface-2 text-[12px] text-muted">
          <div className="px-4 py-2">Tarefa</div>
          <div className="relative h-8">
            {ticks.map((t) => (
              <span key={t} className="absolute top-2 -translate-x-1/2 tabular" style={{ left: pos(t) }}>
                {shortDate(t)}
              </span>
            ))}
          </div>
        </div>
        {tasks.map((t) => {
          const late = t.progress < 100 && t.plannedEnd < today;
          const shouldBe = t.plannedStart <= today ? Math.min(diffDays(t.plannedStart, today) / Math.max(diffDays(t.plannedStart, t.plannedEnd), 1), 1) * 100 : 0;
          const behind = t.progress + 10 < shouldBe;
          return (
            <div key={t.id} className="grid grid-cols-[260px_1fr] border-b border-border/70">
              <div className="px-4 py-2.5">
                <p className="text-sm font-medium leading-tight">{t.name}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {date(t.plannedStart)} a {date(t.plannedEnd)}
                  {t.responsible ? `, ${t.responsible}` : ""}
                </p>
                {t.dependsOnName && <p className="text-[11px] text-muted">Depende de: {t.dependsOnName}</p>}
                {renderActions && <div className="mt-1.5">{renderActions(t)}</div>}
              </div>
              <div className="relative">
                {ticks.map((tk) => (
                  <span key={tk} className="absolute inset-y-0 w-px bg-border/60" style={{ left: pos(tk) }} />
                ))}
                <span className="absolute inset-y-0 z-10 w-0.5 bg-accent" style={{ left: pos(today) }} title="Hoje" />
                <div
                  className={cn("absolute top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-md ring-1 ring-inset", late || behind ? "bg-danger-soft ring-danger/40" : "bg-primary-soft ring-primary/30")}
                  style={{ left: pos(t.plannedStart), width: `calc(${pos(addDays(t.plannedEnd, 0))} - ${pos(t.plannedStart)})` }}
                  title={`${t.progress}% concluído`}
                >
                  <div className={cn("h-full", late || behind ? "bg-danger" : t.progress >= 100 ? "bg-success" : "bg-primary")} style={{ width: `${t.progress}%` }} />
                  <span className={cn("absolute inset-0 flex items-center px-2 text-[11px] font-medium", t.progress > 45 ? "text-white" : "text-text")}>{t.progress}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
