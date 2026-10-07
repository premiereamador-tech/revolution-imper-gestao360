import { Badge, Card, CardHeader, EmptyState, Field, Progress } from "@/components/ui/primitives";
import { area, date, number, pct } from "@/lib/format";
import { projectAreasWithApps } from "@/server/services/project-detail";
import type { Core } from "./types";

const yes = (b: boolean | null) => (b === null ? "—" : b ? "Sim" : "Não");

export async function AreasTab({ core }: { core: Core }) {
  const areas = await projectAreasWithApps(core.p.id);
  if (!areas.length) return <Card><EmptyState title="Nenhuma área cadastrada" description="As áreas são criadas a partir dos itens em m² do orçamento aprovado." /></Card>;
  return (
    <div className="space-y-6">
      {areas.map((a) => {
        const prog = a.contractedArea ? (a.executedArea / a.contractedArea) * 100 : 0;
        return (
          <Card key={a.id}>
            <CardHeader
              title={a.name}
              description={[a.typeName, a.structureType, a.location].filter(Boolean).join(", ")}
              actions={<span className="font-display text-xl font-semibold tabular">{pct(prog, 0)}</span>}
            />
            <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <Progress value={prog} className="mb-4" />
                <dl className="grid grid-cols-3 gap-3">
                  <Field label="Contratada">{area(a.contractedArea)}</Field>
                  <Field label="Medida">{area(a.measuredArea)}</Field>
                  <Field label="Executada">{area(a.executedArea)}</Field>
                  <Field label="Substrato">{a.substrate}</Field>
                  <Field label="Condição">{a.substrateCondition}</Field>
                  <Field label="Umidade">{a.moisture}</Field>
                  <Field label="Trincas">{yes(a.hasCracks)}</Field>
                  <Field label="Fissuras">{yes(a.hasFissures)}</Field>
                  <Field label="Regularização">{yes(a.needsLeveling)}</Field>
                  <Field label="Caimento correto">{yes(a.slopeOk)}</Field>
                  <Field label="Ralos">{a.drains}</Field>
                  <Field label="Tubulações">{a.pipes}</Field>
                  <Field label="Juntas" className="col-span-3">{a.joints}</Field>
                  <Field label="Rodapés / arremates" className="col-span-3">{[a.baseboards, a.finishing].filter(Boolean).join("; ") || "—"}</Field>
                  <Field label="Pontos críticos" className="col-span-3">{a.criticalPoints}</Field>
                </dl>
              </div>
              <div className="space-y-4">
                {a.applications.length === 0 && <p className="text-sm text-muted">Nenhum sistema de impermeabilização vinculado.</p>}
                {a.applications.map(({ app, systemName, productName, productUnit, teamName }) => {
                  const realPerM2 = app.usedQuantity && a.executedArea ? app.usedQuantity / a.executedArea : null;
                  const over = realPerM2 && app.plannedConsumptionPerM2 ? (realPerM2 / app.plannedConsumptionPerM2 - 1) * 100 : null;
                  return (
                    <div key={app.id} className="rounded-xl border border-border p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <p className="font-medium">{systemName}</p>
                        {over !== null && over >= 10 && <Badge tone="red">Consumo {pct(over, 0)} acima</Badge>}
                        {over !== null && over < 10 && <Badge tone="green">Consumo dentro do previsto</Badge>}
                      </div>
                      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Field label="Produto">{productName}</Field>
                        <Field label="Fabricante">{app.manufacturer}</Field>
                        <Field label="Primer">{app.primer}</Field>
                        <Field label="Demãos">{app.coats}</Field>
                        <Field label="Qtd. prevista">{app.plannedQuantity ? `${number(app.plannedQuantity)} ${productUnit ?? ""}` : "—"}</Field>
                        <Field label="Qtd. utilizada">{app.usedQuantity ? `${number(app.usedQuantity)} ${productUnit ?? ""}` : "—"}</Field>
                        <Field label="Consumo previsto/m²">{app.plannedConsumptionPerM2 ? number(app.plannedConsumptionPerM2, 3) : "—"}</Field>
                        <Field label="Consumo real/m²">{realPerM2 ? number(realPerM2, 3) : "—"}</Field>
                        <Field label="Espessura prevista">{app.plannedThicknessMm ? `${number(app.plannedThicknessMm)} mm` : "—"}</Field>
                        <Field label="Espessura executada">{app.executedThicknessMm ? `${number(app.executedThicknessMm)} mm` : "—"}</Field>
                        <Field label="Entre demãos">{app.intervalBetweenCoatsHours ? `${app.intervalBetweenCoatsHours} h` : "—"}</Field>
                        <Field label="Cura">{app.cureHours ? `${app.cureHours} h` : "—"}</Field>
                        <Field label="Método">{app.method}</Field>
                        <Field label="Equipe">{teamName}</Field>
                        <Field label="Início">{date(app.startedAt)}</Field>
                        <Field label="Término">{date(app.finishedAt)}</Field>
                      </dl>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
