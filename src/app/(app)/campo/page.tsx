import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { PageHeader } from "@/components/ui/primitives";
import { nextPunch, PUNCH_LABEL } from "@/domain/timesheet";
import { todayISO } from "@/domain/dates";
import { number, time } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { checklists, checklistTemplateItems, checklistTemplates, dailyLogs, employees, productBatches, products, projects, projectTeamAssignments, teamMembers, timeEntries, warehouses } from "@/server/db/schema";
import { projectAreasWithApps } from "@/server/services/project-detail";
import { projectsForSelect } from "@/server/services/projects";
import { stockBalances } from "@/server/services/stock";
import { FieldApp, type FieldData } from "./field-app";

export const metadata: Metadata = { title: "Meu dia em campo" };

/** Home mobile do encarregado/aplicador (§52, §60, §87). */
export default async function CampoPage({ searchParams }: { searchParams: Promise<{ obra?: string; acao?: string }> }) {
  const user = await requireUser(["field:use"]);
  const sp = await searchParams;
  const today = todayISO();
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  // Obra atual: a da equipe do funcionário; quem não é de equipe escolhe a obra
  let projectId = sp.obra && /^[0-9a-f-]{36}$/.test(sp.obra) ? sp.obra : undefined;
  let teamSize = 0;
  if (user.employeeId) {
    const [a] = await db
      .select({ projectId: projectTeamAssignments.projectId, teamId: projectTeamAssignments.teamId })
      .from(teamMembers)
      .innerJoin(projectTeamAssignments, and(eq(projectTeamAssignments.teamId, teamMembers.teamId), isNull(projectTeamAssignments.endDate)))
      .where(eq(teamMembers.employeeId, user.employeeId))
      .limit(1);
    if (a) {
      projectId ??= a.projectId;
      const [c] = await db.select({ c: sql<string>`count(*)` }).from(teamMembers).innerJoin(employees, eq(employees.id, teamMembers.employeeId)).where(and(eq(teamMembers.teamId, a.teamId), eq(employees.status, "ativo")));
      teamSize = Number(c.c);
    }
  }
  const options = !user.employeeId || sp.obra ? await projectsForSelect(user.companyId) : [];

  const [project] = projectId
    ? await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.companyId, user.companyId))).limit(1)
    : [undefined];

  let data: FieldData = {
    greeting,
    firstName: user.name.split(" ")[0],
    employeeId: user.employeeId,
    nextPunchLabel: null,
    punchesToday: [],
    project: null,
    today: { team: teamSize, target: null, executed: 0, date: today },
    areas: [],
    materials: [],
    checklists: [],
    canMeasure: can(user, "measurements:edit"),
    canMaterial: can(user, "stock:move"),
    canOccurrence: can(user, "quality:edit"),
    initialAction: sp.acao === "ponto" || sp.acao === "diario" || sp.acao === "material" ? sp.acao : undefined,
  };

  if (user.employeeId) {
    const [entry] = await db.select().from(timeEntries).where(and(eq(timeEntries.employeeId, user.employeeId), eq(timeEntries.date, today))).limit(1);
    const next = entry ? (entry.type === "trabalho" ? nextPunch(entry) : null) : "clockIn";
    data.nextPunchLabel = next ? PUNCH_LABEL[next] : null;
    if (entry) {
      data.punchesToday = (["clockIn", "breakStart", "breakEnd", "clockOut"] as const).filter((k) => entry[k]).map((k) => ({ label: PUNCH_LABEL[k], time: time(entry[k]) }));
    }
  }

  if (project) {
    const [areas, [wh], [logAgg], templates, items, open] = await Promise.all([
      projectAreasWithApps(project.id),
      db.select().from(warehouses).where(eq(warehouses.projectId, project.id)).limit(1),
      db.select({ a: sql<string>`coalesce(sum(${dailyLogs.executedArea}), 0)`, w: sql<string>`max(${dailyLogs.workersPresent})` }).from(dailyLogs).where(and(eq(dailyLogs.projectId, project.id), eq(dailyLogs.date, today))),
      db.select().from(checklistTemplates).where(and(eq(checklistTemplates.companyId, user.companyId), eq(checklistTemplates.active, true))).orderBy(asc(checklistTemplates.name)),
      db.select().from(checklistTemplateItems).orderBy(asc(checklistTemplateItems.position)),
      db.select().from(checklists).where(and(eq(checklists.projectId, project.id), eq(checklists.status, "aberto"))),
    ]);
    let materials: FieldData["materials"] = [];
    if (wh) {
      const bal = (await stockBalances(user.companyId)).filter((b) => b.warehouseId === wh.id && b.qty > 0);
      const prods = bal.length ? await db.select().from(products).where(eq(products.companyId, user.companyId)) : [];
      const batches = bal.length ? await db.select().from(productBatches) : [];
      materials = bal.map((b) => {
        const pr = prods.find((x) => x.id === b.productId)!;
        const bt = batches.find((x) => x.id === b.batchId);
        return { value: `${b.productId}|${b.batchId ?? ""}`, label: `${pr.name} | lote ${bt?.batchNumber ?? "s/n"} | tem ${number(b.qty)} ${pr.unit}` };
      });
    }
    data = {
      ...data,
      project: { id: project.id, name: project.name, code: project.code, warehouseId: wh?.id ?? null },
      today: { team: teamSize || Number(logAgg.w ?? 0), target: project.dailyTargetArea, executed: Number(logAgg.a), date: today },
      areas: areas.map((a) => ({ id: a.id, name: a.name })),
      materials,
      checklists: templates.map((t) => ({
        templateId: t.id,
        name: t.name,
        checklistId: open.find((o) => o.templateId === t.id)?.id,
        items: items.filter((i) => i.templateId === t.id).map((i) => ({ id: i.id, question: i.question, photoRequired: i.photoRequired, required: i.required })),
      })),
    };
  }

  return (
    <>
      <div className="mb-4 hidden lg:block">
        <PageHeader title="Meu dia em campo" description="Versão para celular: instale o app pelo navegador (Adicionar à tela inicial)." />
      </div>
      {options.length > 0 && (
        <div className="mx-auto mb-4 max-w-lg">
          <p className="mb-2 text-sm text-muted">Escolha a obra:</p>
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <Link key={o.id} href={`/campo?obra=${o.id}`} className={`rounded-full border px-3 py-1.5 text-sm ${o.id === projectId ? "border-primary bg-primary text-white" : "border-border bg-surface"}`}>
                {o.code}
              </Link>
            ))}
          </div>
        </div>
      )}
      <FieldApp data={data} />
    </>
  );
}
