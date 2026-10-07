import type { Metadata } from "next";
import { ProjectTable } from "@/components/domain/project-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Card, EmptyState, Kpi, LinkButton, PageHeader } from "@/components/ui/primitives";
import { moneyShort } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { savedFiltersFor } from "@/server/services/filters";
import { filterProjects } from "@/server/services/project-filters";
import { loadProjectSummaries } from "@/server/services/project-summary";
import { projectFormOptions } from "@/server/services/projects";

export const metadata: Metadata = { title: "Obras" };

type SP = Promise<Record<string, string | undefined>>;

export default async function ObrasPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser("projects:view");
  const f = await searchParams;
  const [all, opts, saved] = await Promise.all([loadProjectSummaries(user.companyId), projectFormOptions(user.companyId), savedFiltersFor(user.id, "/obras")]);
  const list = filterProjects(all, f);
  const showFinance = can(user, "projects:finance");
  const open = all.filter((p) => p.statusCategory === "ativa" || p.statusCategory === "pausada");
  const avg = open.length ? (open.reduce((s, p) => s + p.physicalProgress, 0) / open.length) * 100 : 0;
  const cities = [...new Set(all.map((p) => p.city).filter(Boolean))] as string[];
  const exportQuery = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Obras"
        description="Cada obra com seu semáforo, avanço, prazo e resultado projetado."
        actions={
          <>
            <LinkButton href={`/api/export/obras?${exportQuery}`} variant="secondary" prefetch={false}>
              Exportar Excel/CSV
            </LinkButton>
            {can(user, "projects:edit") && <LinkButton href="/obras/nova">Nova obra</LinkButton>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Ativas" value={all.filter((p) => p.statusCategory === "ativa").length} href="/obras?grupo=ativas" />
        <Kpi label="Planejadas" value={all.filter((p) => p.statusCategory === "pre_obra").length} href="/obras?grupo=planejadas" />
        <Kpi label="Paralisadas" value={all.filter((p) => p.statusCategory === "pausada").length} href="/obras?grupo=paralisadas" />
        <Kpi label="Atrasadas" value={open.filter((p) => (p.forecast.delayDays ?? 0) > 0).length} tone="negative" href="/obras?grupo=atrasadas" />
        <Kpi label="Concluídas" value={all.filter((p) => p.statusCategory === "concluida").length} href="/obras?grupo=concluidas" />
        <Kpi label="Em garantia" value={all.filter((p) => p.statusCategory === "garantia").length} href="/obras?grupo=garantia" />
        <Kpi label="Avanço médio" value={`${avg.toFixed(0)}%`} hint="Obras em andamento" />
        {showFinance && <Kpi label="Valor pendente" value={moneyShort(open.reduce((s, p) => s + p.finance.revenue - p.finance.received, 0))} hint="A receber das obras ativas" />}
      </div>

      <FilterBar
        saved={saved}
        fields={[
          { name: "q", label: "Buscar", type: "search", placeholder: "Código, nome, cliente…" },
          {
            name: "grupo",
            label: "Situação",
            type: "select",
            options: [
              { value: "ativas", label: "Em andamento" },
              { value: "planejadas", label: "Planejadas" },
              { value: "paralisadas", label: "Paralisadas" },
              { value: "atrasadas", label: "Atrasadas" },
              { value: "concluidas", label: "Concluídas" },
              { value: "garantia", label: "Em garantia" },
              ...(showFinance ? [{ value: "prejuizo", label: "Perdendo dinheiro" }] : []),
            ],
          },
          { name: "saude", label: "Semáforo", type: "select", options: [{ value: "verde", label: "Saudável" }, { value: "amarelo", label: "Atenção" }, { value: "vermelho", label: "Crítica" }] },
          { name: "status", label: "Status", type: "select", options: opts.statusList.map((s) => ({ value: s.key, label: s.label })) },
          { name: "cliente", label: "Cliente", type: "select", options: opts.clientList.map((c) => ({ value: c.id, label: c.name })) },
          { name: "cidade", label: "Cidade", type: "select", options: cities.map((c) => ({ value: c, label: c })) },
        ]}
      />

      <Card>
        {list.length ? (
          <ProjectTable projects={list} showFinance={showFinance} />
        ) : (
          <EmptyState title="Nenhuma obra encontrada" description="Ajuste os filtros ou cadastre uma nova obra." action={can(user, "projects:edit") && <LinkButton href="/obras/nova">Nova obra</LinkButton>} />
        )}
      </Card>
    </>
  );
}
