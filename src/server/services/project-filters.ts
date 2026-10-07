import type { ProjectSummary } from "./project-summary";

export function filterProjects(list: ProjectSummary[], f: Record<string, string | undefined>) {
  const q = f.q?.toLowerCase();
  return list.filter((p) => {
    if (q && !`${p.code} ${p.name} ${p.clientName} ${p.city ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.status && p.statusKey !== f.status) return false;
    if (f.cliente && p.clientId !== f.cliente) return false;
    if (f.cidade && p.city !== f.cidade) return false;
    if (f.saude && p.health.level !== f.saude) return false;
    const open = p.statusCategory === "ativa" || p.statusCategory === "pausada";
    if (f.grupo === "ativas" && !open) return false;
    if (f.grupo === "planejadas" && p.statusCategory !== "pre_obra") return false;
    if (f.grupo === "paralisadas" && p.statusCategory !== "pausada") return false;
    if (f.grupo === "atrasadas" && !(open && (p.forecast.delayDays ?? 0) > 0)) return false;
    if (f.grupo === "concluidas" && p.statusCategory !== "concluida") return false;
    if (f.grupo === "garantia" && p.statusCategory !== "garantia") return false;
    if (f.grupo === "prejuizo" && !p.finance.isLosingMoney) return false;
    return true;
  });
}

