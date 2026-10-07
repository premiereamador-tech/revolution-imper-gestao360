import type { Metadata } from "next";
import { FilterBar } from "@/components/ui/filter-bar";
import { PrintButton } from "@/components/ui/print-button";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { endOfMonth, startOfMonth, todayISO } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { date, money, pct } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { loadDre } from "@/server/services/finance";
import { financeOptions } from "@/server/services/options";

export const metadata: Metadata = { title: "DRE gerencial" };

export default async function DrePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser("finance:view");
  const f = await searchParams;
  const today = todayISO();
  const from = f.de ?? startOfMonth(today);
  const to = f.ate ?? endOfMonth(today);
  const [dre, opts] = await Promise.all([loadDre(user.companyId, { from, to, projectId: f.obra, clientId: f.cliente }), financeOptions(user.companyId)]);
  const scope = f.obra ? opts.projects.find((p) => p.value === f.obra)?.label : f.cliente ? opts.clients.find((c) => c.value === f.cliente)?.label : "Empresa inteira";

  return (
    <>
      <PageHeader title="DRE gerencial" description={`${scope}, de ${date(from)} a ${date(to)}. Regime de competência.`} actions={<PrintButton />} />
      <FilterBar
        fields={[
          { name: "de", label: "De", type: "date" },
          { name: "ate", label: "Até", type: "date" },
          { name: "obra", label: "Obra", type: "select", options: opts.projects, placeholder: "Empresa inteira" },
          { name: "cliente", label: "Cliente", type: "select", options: opts.clients, placeholder: "Todos" },
        ]}
      />
      <Card className="max-w-3xl">
        <CardHeader title="Demonstrativo de resultado" description={`Deduções: ${pct(dre.taxRate, 1)} de impostos sobre o faturamento (ajustável em Configurações).`} />
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[12px] text-muted">
              <th className="px-5 py-2 text-left font-medium" />
              <th className="px-5 py-2 text-right font-medium">Valor</th>
              <th className="px-5 py-2 text-right font-medium">% receita líquida</th>
            </tr>
          </thead>
          <tbody>
            {dre.lines.map((l) => (
              <tr key={l.key} className={cn("border-t border-border/70", l.level === 0 && "bg-surface-2 font-semibold")}>
                <td className={cn("px-5 py-2.5", l.level === 1 && "pl-9 text-muted", l.level === 2 && "pl-9 font-medium")}>{l.label}</td>
                <td className={cn("px-5 py-2.5 text-right tabular", l.key === "lucro_liquido" && (l.value < 0 ? "text-danger" : "text-success"))}>{money(l.value)}</td>
                <td className="px-5 py-2.5 text-right tabular text-muted">{pct(l.pctOfNet)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-border px-5 py-3 text-[12px] text-muted">
          Custos diretos vêm do razão de custos das obras (consumo de material, ponto, terceiros). Compras para estoque e folha de campo não entram de novo, pois já foram apropriadas às obras.
          {(f.obra || f.cliente) && " Despesas administrativas não são rateadas na visão por obra/cliente."}
        </p>
      </Card>
    </>
  );
}
