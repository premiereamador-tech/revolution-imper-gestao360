import type { Metadata } from "next";
import { InsightList } from "@/components/domain/insight-list";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import type { InsightArea } from "@/domain/insights";
import { requireUser } from "@/server/auth/session";
import { loadOperationalSnapshot } from "@/server/services/insights";

export const metadata: Metadata = { title: "Central de alertas" };

const AREAS: Array<[InsightArea, string]> = [
  ["financeiro", "Financeiro"],
  ["obras", "Obras e prazos"],
  ["qualidade", "Qualidade"],
  ["estoque", "Materiais e estoque"],
  ["seguranca", "Segurança do trabalho"],
  ["equipe", "Equipe"],
  ["comercial", "Comercial"],
];

export default async function AlertasPage() {
  const user = await requireUser("dashboard:view");
  const snap = await loadOperationalSnapshot(user.companyId);
  const alerts = snap.insights.filter((i) => i.severity !== "positivo");
  return (
    <>
      <PageHeader title="Central de alertas" description="Gerados automaticamente a partir de obras, financeiro, estoque, segurança e garantias. Resolva a causa e o alerta some sozinho." />
      <div className="grid gap-6 lg:grid-cols-2">
        {AREAS.map(([area, label]) => {
          const list = alerts.filter((a) => a.area === area);
          if (!list.length) return null;
          return (
            <Card key={area}>
              <CardHeader title={label} description={`${list.length} alerta(s)`} />
              <InsightList insights={list} />
            </Card>
          );
        })}
      </div>
      {alerts.length === 0 && <p className="text-sm text-muted">Nenhum alerta no momento.</p>}
    </>
  );
}
