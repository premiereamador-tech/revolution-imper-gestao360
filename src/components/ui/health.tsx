import type { HealthLevel, HealthResult } from "@/domain/health";
import { cn } from "@/lib/cn";

const LABEL: Record<HealthLevel, string> = { verde: "Saudável", amarelo: "Atenção", vermelho: "Crítica" };
const DOT: Record<HealthLevel, string> = { verde: "bg-success", amarelo: "bg-warning", vermelho: "bg-danger" };
const SOFT: Record<HealthLevel, string> = {
  verde: "bg-success-soft text-success",
  amarelo: "bg-warning-soft text-[#8a5800]",
  vermelho: "bg-danger-soft text-danger",
};

export function HealthDot({ level, className }: { level: HealthLevel; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", DOT[level], className)} aria-label={LABEL[level]} />;
}

export function healthStripe(level: HealthLevel) {
  return { verde: "border-l-success", amarelo: "border-l-warning", vermelho: "border-l-danger" }[level];
}

/**
 * Semáforo clicável: abre a explicação de por que a obra recebeu a cor (§6).
 * Usa <details> — funciona sem JavaScript e é acessível por teclado.
 */
export function HealthBadge({ health, compact }: { health: HealthResult; compact?: boolean }) {
  return (
    <details className="group relative inline-block">
      <summary className={cn("inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium [&::-webkit-details-marker]:hidden", SOFT[health.level])}>
        <HealthDot level={health.level} className="size-2" />
        {compact ? null : LABEL[health.level]}
        <span className="sr-only">— ver motivos</span>
      </summary>
      <div className="absolute left-0 z-30 mt-2 w-80 rounded-xl border border-border bg-surface p-4 text-left shadow-xl">
        <p className="text-sm font-semibold text-text">Por que {LABEL[health.level].toLowerCase()}?</p>
        {health.reasons.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">Prazo, custos, recebimentos, material e qualidade dentro do esperado.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {health.reasons.map((r) => (
              <li key={r.code} className="flex gap-2 text-[13px] leading-snug text-text">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", r.severity === "critico" ? "bg-danger" : "bg-warning")} />
                {r.message}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted">Pontuação {health.score}. Limites ajustáveis em Configurações.</p>
      </div>
    </details>
  );
}

export const HEALTH_LABEL = LABEL;
