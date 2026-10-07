import type { ProjectFinanceResult } from "@/domain/project-finance";
import { cn } from "@/lib/cn";
import { money0, pct } from "@/lib/format";

/**
 * Linha d'água — elemento-assinatura do sistema (§89).
 * A receita é a borda do reservatório; o custo incorrido é a água já usada
 * e o custo projetado é o nível final. Se passar da borda, transborda em vermelho.
 */
export function Waterline({ finance, size = "lg" }: { finance: ProjectFinanceResult; size?: "lg" | "sm" }) {
  const scaleMax = Math.max(finance.revenue, finance.projectedCost, 1) * (size === "lg" ? 1.08 : 1.02);
  const w = (v: number) => `${Math.min((v / scaleMax) * 100, 100)}%`;
  const overflow = finance.projectedCost > finance.revenue;
  const profit = finance.projectedProfit;

  if (size === "sm") {
    return (
      <div className="w-full" aria-label={`Custo projetado ${money0(finance.projectedCost)} de receita ${money0(finance.revenue)}`}>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-border">
          <div className={cn("absolute inset-y-0 left-0", overflow ? "bg-danger/35" : "bg-accent/35")} style={{ width: w(finance.projectedCost) }} />
          <div className={cn("absolute inset-y-0 left-0", overflow ? "bg-danger" : "bg-primary")} style={{ width: w(finance.incurredCost) }} />
          <div className="absolute inset-y-[-2px] w-0.5 bg-text" style={{ left: w(finance.revenue) }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-sm text-muted">{overflow ? "Esta obra está perdendo dinheiro" : "Esta obra está ganhando dinheiro"}</p>
        <p className={cn("font-display text-[40px] font-semibold leading-none tabular md:text-[48px]", overflow ? "text-danger" : "text-success")}>
          {profit >= 0 ? "+" : "−"}
          {money0(Math.abs(profit))}
          <span className="ml-2 align-middle text-base font-medium text-muted">lucro projetado, margem de {pct(finance.projectedMargin)}</span>
        </p>
      </div>

      <div className="relative mt-5">
        <div className="relative h-11 w-full overflow-hidden rounded-lg bg-[repeating-linear-gradient(135deg,var(--surface-2)_0_6px,#fff_6px_12px)] ring-1 ring-inset ring-border">
          <div className={cn("waterline-fill absolute inset-y-0 left-0", overflow ? "bg-danger/25" : "bg-accent/30")} style={{ width: w(finance.projectedCost) }} />
          <div className={cn("waterline-fill absolute inset-y-0 left-0", overflow ? "bg-danger" : "bg-primary")} style={{ width: w(finance.incurredCost) }} />
        </div>
        <div className="absolute -top-2 bottom-[-8px] w-[3px] rounded bg-text" style={{ left: `calc(${w(finance.revenue)} - 1px)` }} aria-hidden />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
        <Legend swatch={overflow ? "bg-danger" : "bg-primary"} label="Custo já incorrido" value={money0(finance.incurredCost)} />
        <Legend swatch={overflow ? "bg-danger/30" : "bg-accent/40"} label="Custo projetado no fim" value={money0(finance.projectedCost)} />
        <Legend swatch="bg-text" label="Receita total (contrato + aditivos)" value={money0(finance.revenue)} />
        <Legend swatch="bg-success" label="Lucro realizado até hoje" value={`${money0(finance.realizedProfit)} (${pct(finance.realizedMargin)})`} />
      </dl>
    </div>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[12px] text-muted">
        <span className={cn("inline-block h-2.5 w-2.5 rounded-sm", swatch)} />
        {label}
      </dt>
      <dd className="mt-0.5 font-medium tabular text-text">{value}</dd>
    </div>
  );
}
