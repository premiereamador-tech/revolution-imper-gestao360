import Link from "next/link";
import { HealthBadge } from "@/components/ui/health";
import { Badge, Progress, Table, Td, Th } from "@/components/ui/primitives";
import { Waterline } from "@/components/ui/waterline";
import { date, money0, pct } from "@/lib/format";
import type { ProjectSummary } from "@/server/services/project-summary";

export function ProjectTable({ projects, showFinance }: { projects: ProjectSummary[]; showFinance: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-8" aria-label="Saúde" />
          <Th>Obra</Th>
          <Th>Status</Th>
          <Th align="right">Avanço</Th>
          <Th>Prazo</Th>
          {showFinance && <Th align="right">Contrato</Th>}
          {showFinance && <Th className="min-w-44">Custo × receita</Th>}
          {showFinance && <Th align="right">Margem proj.</Th>}
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => {
          const delay = p.forecast.delayDays;
          const isOpen = p.statusCategory === "ativa" || p.statusCategory === "pausada";
          return (
            <tr key={p.id} className="hover:bg-surface-2/60">
              <Td>
                <HealthBadge health={p.health} compact />
              </Td>
              <Td className="min-w-56">
                <Link href={`/obras/${p.id}`} className="font-medium text-text hover:text-primary">
                  {p.name}
                </Link>
                <p className="text-[12px] text-muted">
                  {p.code} | {p.clientName}
                  {p.city ? `, ${p.city}` : ""}
                </p>
              </Td>
              <Td>
                <Badge tone={p.statusColor}>{p.statusLabel}</Badge>
              </Td>
              <Td align="right" className="min-w-28">
                <span className="tabular">{pct(p.physicalProgress * 100, 0)}</span>
                <Progress value={p.physicalProgress * 100} className="mt-1" tone={p.health.level === "vermelho" ? "danger" : p.health.level === "amarelo" ? "warning" : "primary"} />
              </Td>
              <Td className="whitespace-nowrap">
                <span className="tabular">{date(p.adjustedPlannedEnd)}</span>
                {isOpen && delay !== null && delay > 0 && <p className="text-[12px] text-danger">+{delay} dias previstos</p>}
                {isOpen && delay !== null && delay <= 0 && <p className="text-[12px] text-success">no prazo</p>}
                {!isOpen && p.statusCategory === "pre_obra" && <p className="text-[12px] text-muted">início {date(p.plannedStart)}</p>}
              </Td>
              {showFinance && <Td align="right">{money0(p.finance.revenue)}</Td>}
              {showFinance && (
                <Td>
                  <Waterline finance={p.finance} size="sm" />
                </Td>
              )}
              {showFinance && (
                <Td align="right" className={p.finance.isLosingMoney ? "font-medium text-danger" : (p.finance.projectedMargin ?? 0) < 20 ? "text-warning" : "text-text"}>
                  {pct(p.finance.projectedMargin)}
                </Td>
              )}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
