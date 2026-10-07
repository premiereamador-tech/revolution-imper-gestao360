import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { date } from "@/lib/format";
import { projectTimeline } from "@/server/services/project-detail";
import type { Core } from "./types";

const DOT = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger", muted: "bg-border" } as const;

export async function TimelineTab({ core }: { core: Core }) {
  const events = await projectTimeline(core.p.id);
  return (
    <Card>
      <CardHeader title="Linha do tempo da obra" description="Montada automaticamente a partir de contrato, diários, fotos, medições, pagamentos, ocorrências e entrega." />
      {events.length === 0 ? (
        <EmptyState title="Ainda não há eventos" />
      ) : (
        <ol className="relative px-5 py-5">
          <span className="absolute bottom-5 left-[29px] top-5 w-px bg-border" aria-hidden />
          {events.map((e, i) => (
            <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
              <span className={cn("relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-surface", DOT[e.tone])} />
              <div className="grid flex-1 gap-0.5 sm:grid-cols-[100px_1fr] sm:gap-4">
                <time className="text-[13px] tabular text-muted">{date(e.date)}</time>
                <div>
                  <p className="text-sm text-text">{e.title}</p>
                  {e.detail && <p className="text-[12px] text-muted">{e.detail}</p>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
