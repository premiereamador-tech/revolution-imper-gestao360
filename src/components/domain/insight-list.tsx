import Link from "next/link";
import type { Insight } from "@/domain/insights";
import { cn } from "@/lib/cn";

const TONE: Record<Insight["severity"], { dot: string; label: string }> = {
  critico: { dot: "bg-danger", label: "Crítico" },
  atencao: { dot: "bg-warning", label: "Atenção" },
  positivo: { dot: "bg-success", label: "Destaque" },
  info: { dot: "bg-primary", label: "Informativo" },
};

export function InsightList({ insights, numbered, empty = "Nada exige atenção agora." }: { insights: Insight[]; numbered?: boolean; empty?: string }) {
  if (!insights.length) return <p className="px-5 py-6 text-sm text-muted">{empty}</p>;
  return (
    <ol className="divide-y divide-border">
      {insights.map((i, idx) => {
        const body = (
          <div className="flex gap-3 px-5 py-3.5">
            {numbered ? (
              <span className={cn("font-display mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white", TONE[i.severity].dot)}>{idx + 1}</span>
            ) : (
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE[i.severity].dot)} aria-label={TONE[i.severity].label} />
            )}
            <div className="min-w-0">
              <p className="text-sm leading-snug text-text">{i.title}</p>
              {i.detail && <p className="mt-0.5 text-[13px] text-muted">{i.detail}</p>}
            </div>
          </div>
        );
        return <li key={i.id}>{i.href ? <Link href={i.href} className="block transition-colors hover:bg-surface-2">{body}</Link> : body}</li>;
      })}
    </ol>
  );
}
