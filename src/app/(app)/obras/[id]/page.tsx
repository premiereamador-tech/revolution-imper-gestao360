import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HealthBadge } from "@/components/ui/health";
import { Badge, LinkButton, PageHeader, Tabs } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { date, money0, pct } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { projectCore } from "@/server/services/project-detail";
import { loadProjectSummary } from "@/server/services/project-summary";
import { AreasTab } from "./_tabs/areas";
import { DiaryTab } from "./_tabs/diary";
import { FinanceTab } from "./_tabs/finance";
import { MaterialsTab } from "./_tabs/materials";
import { MeasurementsTab } from "./_tabs/measurements";
import { OverviewTab } from "./_tabs/overview";
import { PhotosTab } from "./_tabs/photos";
import { QualityTab } from "./_tabs/quality";
import { ScheduleTab } from "./_tabs/schedule";
import { TeamTab } from "./_tabs/team";
import { TimelineTab } from "./_tabs/timeline";
import { WarrantyTab } from "./_tabs/warranty";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const user = await requireUser("projects:view");
  const core = await projectCore(user.companyId, id);
  return { title: core ? `${core.p.code} ${core.p.name}` : "Obra" };
}

export default async function ObraPage({ params, searchParams }: Props) {
  const user = await requireUser("projects:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { tab = "visao-geral" } = await searchParams;
  const [core, summary] = await Promise.all([projectCore(user.companyId, id), loadProjectSummary(user.companyId, id)]);
  if (!core || !summary) notFound();
  const fin = can(user, "projects:finance");
  const f = summary.finance;

  const tabs = [
    { key: "visao-geral", label: "Visão geral" },
    ...(fin ? [{ key: "financeiro", label: "Financeiro" }] : []),
    { key: "cronograma", label: "Cronograma" },
    { key: "areas", label: "Áreas e impermeabilização" },
    { key: "diario", label: "Diário" },
    { key: "fotos", label: "Fotos" },
    { key: "materiais", label: "Materiais" },
    { key: "medicoes", label: "Medições" },
    { key: "qualidade", label: "Qualidade", count: summary.openNonconformities },
    { key: "equipe", label: "Equipe" },
    { key: "garantia", label: "Entrega e garantia" },
    { key: "linha-do-tempo", label: "Linha do tempo" },
  ].map((t) => ({ ...t, href: `/obras/${id}?tab=${t.key}` }));
  const active = tabs.some((t) => t.key === tab) ? tab : "visao-geral";

  const metrics: Array<{ label: string; value: string; tone?: string }> = [
    ...(fin
      ? [
          { label: "Valor (contrato + aditivos)", value: money0(f.revenue) },
          { label: "Recebido", value: money0(f.received) },
          { label: "A receber", value: money0(f.revenue - f.received) },
          { label: "Gasto até hoje", value: money0(f.incurredCost) },
          { label: "Lucro projetado", value: money0(f.projectedProfit), tone: f.isLosingMoney ? "text-danger" : "text-success" },
          { label: "Margem projetada", value: pct(f.projectedMargin), tone: f.isLosingMoney ? "text-danger" : (f.projectedMargin ?? 0) < 20 ? "text-warning" : undefined },
        ]
      : []),
    { label: "Prazo contratual", value: date(summary.adjustedPlannedEnd) },
    {
      label: summary.statusCategory === "concluida" || summary.statusCategory === "garantia" ? "Concluída em" : "Dias restantes",
      value:
        summary.statusCategory === "concluida" || summary.statusCategory === "garantia"
          ? date(summary.actualEnd)
          : summary.daysRemaining === null
            ? "—"
            : summary.daysRemaining < 0
              ? `${Math.abs(summary.daysRemaining)} vencidos`
              : String(summary.daysRemaining),
      tone: (summary.daysRemaining ?? 0) < 0 ? "text-danger" : undefined,
    },
    { label: "Executado", value: pct(summary.physicalProgress * 100, 0) },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/obras", label: "Obras" }}
        title={core.p.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {core.p.code} | {core.client.name}
              {core.p.city ? `, ${core.p.city}/${core.p.state ?? ""}` : ""}
            </span>
            <Badge tone={summary.statusColor}>{summary.statusLabel}</Badge>
            <HealthBadge health={summary.health} />
          </span>
        }
        actions={
          <>
            <LinkButton href={`/impressao/obra/${id}/relatorio`} target="_blank" variant="secondary" prefetch={false}>
              Relatório da obra (PDF)
            </LinkButton>
            {can(user, "field:use") && <LinkButton href={`/campo?obra=${id}`}>Abrir no campo</LinkButton>}
          </>
        }
      />

      <dl className="mb-6 flex flex-wrap gap-px overflow-hidden rounded-[var(--radius-card)] border border-border bg-border">
        {metrics.map((m) => (
          <div key={m.label} className="flex-1 basis-[160px] bg-surface px-4 py-3">
            <dt className="text-[12px] text-muted">{m.label}</dt>
            <dd className={cn("font-display mt-0.5 whitespace-nowrap text-[22px] font-semibold tabular", m.tone ?? "text-text")}>{m.value}</dd>
          </div>
        ))}
      </dl>

      <Tabs items={tabs} active={active} />

      {active === "visao-geral" && <OverviewTab user={user} core={core} summary={summary} />}
      {active === "financeiro" && fin && <FinanceTab user={user} core={core} summary={summary} />}
      {active === "cronograma" && <ScheduleTab user={user} core={core} summary={summary} />}
      {active === "areas" && <AreasTab core={core} />}
      {active === "diario" && <DiaryTab user={user} core={core} />}
      {active === "fotos" && <PhotosTab user={user} core={core} />}
      {active === "materiais" && <MaterialsTab user={user} core={core} />}
      {active === "medicoes" && <MeasurementsTab user={user} core={core} summary={summary} />}
      {active === "qualidade" && <QualityTab user={user} core={core} />}
      {active === "equipe" && <TeamTab user={user} core={core} />}
      {active === "garantia" && <WarrantyTab user={user} core={core} summary={summary} />}
      {active === "linha-do-tempo" && <TimelineTab core={core} />}
    </>
  );
}
