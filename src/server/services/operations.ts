import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  contractAdditions,
  contracts,
  measurementItems,
  measurements,
  nonconformities,
  projectAreas,
  projectPhotos,
  projects,
  projectTasks,
} from "@/server/db/schema";
import { audit } from "@/server/audit";
import { computeMeasurement, MeasurementError } from "@/domain/measurement";
import { todayISO } from "@/domain/dates";
import type { Actor } from "./automations";
import { requestApproval } from "./automations";
import { BusinessError, assertFound } from "./errors";

async function ownProject(companyId: string, projectId: string) {
  const [p] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.companyId, companyId))).limit(1);
  return assertFound(p, "Obra");
}

export async function createMeasurement(
  actor: Actor,
  projectId: string,
  input: { periodStart: string; periodEnd: string; notes?: string; items: Array<{ areaId: string; quantity: number; unitPrice: number }> },
) {
  const project = await ownProject(actor.companyId, projectId);
  if (input.periodEnd < input.periodStart) throw new BusinessError("O fim do período deve ser após o início.");
  const items = input.items.filter((i) => i.quantity > 0);
  if (!items.length) throw new BusinessError("Informe a quantidade medida em pelo menos uma área.");
  return db.transaction(async (tx) => {
    const areas = await tx.select().from(projectAreas).where(and(eq(projectAreas.projectId, projectId), inArray(projectAreas.id, items.map((i) => i.areaId))));
    const prev = await tx
      .select({ areaId: measurementItems.areaId, q: sql<string>`sum(${measurementItems.currentQuantity})` })
      .from(measurementItems)
      .innerJoin(measurements, eq(measurements.id, measurementItems.measurementId))
      .where(eq(measurements.projectId, projectId))
      .groupBy(measurementItems.areaId);
    const prevMap = new Map(prev.map((p) => [p.areaId, Number(p.q)]));
    const built = items.map((i) => {
      const a = assertFound(areas.find((x) => x.id === i.areaId), "Área");
      return { areaId: a.id, service: a.name, contractedQuantity: a.contractedArea, previousQuantity: prevMap.get(a.id) ?? 0, currentQuantity: i.quantity, unitPrice: i.unitPrice };
    });
    let calc;
    try {
      calc = computeMeasurement(built, project.retentionRate);
    } catch (e) {
      if (e instanceof MeasurementError) throw new BusinessError(e.message);
      throw e;
    }
    const [{ next }] = await tx.select({ next: sql<string>`coalesce(max(${measurements.number}), 0) + 1` }).from(measurements).where(eq(measurements.projectId, projectId));
    const [m] = await tx
      .insert(measurements)
      .values({ projectId, number: Number(next), periodStart: input.periodStart, periodEnd: input.periodEnd, status: "executada", grossValue: calc.grossValue, retentionRate: project.retentionRate, retentionValue: calc.retentionValue, netValue: calc.netValue, notes: input.notes })
      .returning();
    await tx.insert(measurementItems).values(calc.items.map((i, idx) => ({ measurementId: m.id, areaId: built[idx].areaId, service: i.service, unit: "m²", contractedQuantity: i.contractedQuantity, previousQuantity: i.previousQuantity, currentQuantity: i.currentQuantity, unitPrice: i.unitPrice, value: i.value })));
    await audit(tx, actor, "measurement.create", "measurement", m.id, undefined, { number: m.number, gross: m.grossValue });
    return m;
  });
}

export async function addContractAddition(actor: Actor, projectId: string, input: { description: string; quantity?: number; unit?: string; value: number; extraDays: number }) {
  const project = await ownProject(actor.companyId, projectId);
  project.contractId = await ensureContract(actor, projectId);
  return db.transaction(async (tx) => {
    const [{ next }] = await tx.select({ next: sql<string>`coalesce(max(${contractAdditions.number}), 0) + 1` }).from(contractAdditions).where(eq(contractAdditions.contractId, project.contractId!));
    const [add] = await tx
      .insert(contractAdditions)
      .values({ contractId: project.contractId!, number: Number(next), description: input.description, quantity: input.quantity, unit: input.unit, value: input.value, extraDays: input.extraDays, status: "pendente" })
      .returning();
    const approval = await requestApproval(tx, actor, "aditivo", add.id, input.value, `Aditivo ${add.number} — ${project.code}: ${input.description}`.slice(0, 300));
    if (approval.autoApproved) await tx.update(contractAdditions).set({ status: "aprovado", approvedAt: new Date() }).where(eq(contractAdditions.id, add.id));
    await audit(tx, actor, "contract_addition.create", "contract_addition", add.id, undefined, { ...add, autoApproved: approval.autoApproved });
    return { ...add, autoApproved: approval.autoApproved, requiredRole: approval.required };
  });
}

export async function createNonconformity(
  actor: Actor,
  projectId: string,
  input: { title: string; description?: string; severity: "baixa" | "media" | "alta" | "critica"; areaId?: string; cause?: string; correctiveAction?: string; dueDate?: string; isRework: boolean; estimatedReworkCost?: number; clientUuid?: string },
) {
  await ownProject(actor.companyId, projectId);
  if (input.clientUuid) {
    const [dup] = await db.select({ id: nonconformities.id }).from(nonconformities).where(eq(nonconformities.clientUuid, input.clientUuid)).limit(1);
    if (dup) return dup;
  }
  const [nc] = await db
    .insert(nonconformities)
    .values({ projectId, ...input, estimatedReworkCost: input.estimatedReworkCost ?? 0, detectedAt: todayISO(), responsibleId: actor.id })
    .returning();
  await audit(db, actor, "nonconformity.create", "nonconformity", nc.id, undefined, nc);
  return nc;
}

export async function updateNonconformityStatus(actor: Actor, id: string, status: "aberta" | "em_tratamento" | "resolvida" | "cancelada", correctiveAction?: string) {
  const [row] = await db
    .select({ nc: nonconformities })
    .from(nonconformities)
    .innerJoin(projects, eq(projects.id, nonconformities.projectId))
    .where(and(eq(nonconformities.id, id), eq(projects.companyId, actor.companyId)))
    .limit(1);
  assertFound(row, "Não conformidade");
  await db
    .update(nonconformities)
    .set({ status, resolvedAt: status === "resolvida" ? todayISO() : null, correctiveAction: correctiveAction ?? row.nc.correctiveAction })
    .where(eq(nonconformities.id, id));
  await audit(db, actor, "nonconformity.status", "nonconformity", id, { status: row.nc.status }, { status });
}

export async function updateTaskProgress(actor: Actor, taskId: string, progress: number) {
  const [row] = await db
    .select({ t: projectTasks })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(and(eq(projectTasks.id, taskId), eq(projects.companyId, actor.companyId)))
    .limit(1);
  const t = assertFound(row, "Tarefa").t;
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  await db
    .update(projectTasks)
    .set({ progress: p, actualStart: p > 0 ? (t.actualStart ?? todayISO()) : t.actualStart, actualEnd: p >= 100 ? (t.actualEnd ?? todayISO()) : null })
    .where(eq(projectTasks.id, taskId));
  await audit(db, actor, "task.progress", "project_task", taskId, { progress: t.progress }, { progress: p });
}

export async function addProjectPhoto(actor: Actor, projectId: string, input: { fileId: string; stage: "antes" | "durante" | "depois" | "nao_conformidade" | "correcao" | "entrega"; areaId?: string; caption?: string }) {
  await ownProject(actor.companyId, projectId);
  const [ph] = await db.insert(projectPhotos).values({ projectId, fileId: input.fileId, stage: input.stage, areaId: input.areaId, caption: input.caption, createdById: actor.id }).returning();
  return ph;
}

export async function ensureContract(actor: Actor, projectId: string) {
  const project = await ownProject(actor.companyId, projectId);
  if (project.contractId) return project.contractId;
  const [c] = await db
    .insert(contracts)
    .values({ companyId: actor.companyId, number: `CT-${project.code}`, clientId: project.clientId, value: project.contractValue, status: "assinado", startDate: project.plannedStart, durationDays: project.contractDays })
    .returning();
  await db.update(projects).set({ contractId: c.id }).where(eq(projects.id, projectId));
  return c.id;
}
