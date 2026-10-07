"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { COST_CATEGORIES } from "@/domain/project-finance";
import { actorFrom, formToObject, runAction, zDate, zMoney, zNumber, zOptDate, zOptNumber, zOptText, zOptUuid, zPositive, zText, zUuid } from "@/server/action-helpers";
import { assertPermission } from "@/server/auth/session";
import {
  approveMeasurement,
  changeProjectStatus,
  createDailyLog,
  invoiceMeasurement,
  recordTightnessTest,
  registerStockMovement,
  signDeliveryTerm,
} from "@/server/services/automations";
import {
  addContractAddition,
  addProjectPhoto,
  createMeasurement,
  createNonconformity,
  updateNonconformityStatus,
  updateTaskProgress,
} from "@/server/services/operations";
import { createProject, updateProjectBudget } from "@/server/services/projects";
import { saveUpload } from "@/server/storage";

const budgetShape = Object.fromEntries(COST_CATEGORIES.map((c) => [`budget_${c}`, zOptNumber])) as Record<string, typeof zOptNumber>;

const projectSchema = z.object({
  name: zText(200),
  clientId: zUuid,
  statusKey: z.string().min(1),
  zipCode: zOptText(9),
  address: zOptText(300),
  city: zOptText(120),
  state: z.string().length(2).optional(),
  plannedStart: zOptDate,
  contractDays: zOptNumber,
  contractValue: zMoney,
  contractedArea: zMoney,
  dailyTargetArea: zOptNumber,
  retentionRate: zOptNumber,
  warrantyMonths: zOptNumber,
  engineerId: zOptUuid,
  foremanEmployeeId: zOptUuid,
  clientContactName: zOptText(120),
  clientContactPhone: zOptText(20),
  clientContactEmail: z.string().email("E-mail inválido").optional(),
  paymentMethod: zOptText(120),
  notes: zOptText(2000),
  ...budgetShape,
});

export async function createProjectAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("projects:edit");
    const d = projectSchema.parse(formToObject(fd));
    const budget = Object.fromEntries(COST_CATEGORIES.map((c) => [c, (d as Record<string, unknown>)[`budget_${c}`] as number | undefined]));
    const p = await createProject(await actorFrom(user), { ...d, budget });
    revalidatePath("/obras");
    return { ok: true, redirectTo: `/obras/${p.id}` };
  });
}

export async function updateBudgetAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission(["projects:edit", "projects:finance"]);
    const raw = formToObject(fd);
    const projectId = zUuid.parse(raw.projectId);
    const parsed = z.object(budgetShape).parse(raw);
    const budget = Object.fromEntries(COST_CATEGORIES.map((c) => [c, (parsed as Record<string, number | undefined>)[`budget_${c}`] ?? 0]));
    await updateProjectBudget(await actorFrom(user), projectId, budget);
    revalidatePath(`/obras/${projectId}`);
    return { ok: true, message: "Orçamento de custos atualizado." };
  });
}

export async function changeStatusAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("projects:edit");
    const { projectId, statusKey } = z.object({ projectId: zUuid, statusKey: z.string().min(1) }).parse(formToObject(fd));
    await changeProjectStatus(await actorFrom(user), projectId, statusKey);
    revalidatePath(`/obras/${projectId}`);
    return { ok: true, message: "Status atualizado." };
  });
}

const dailyLogSchema = z.object({
  projectId: zUuid,
  date: zDate,
  clientUuid: z.string().uuid().optional(),
  weather: zOptText(40),
  workersPresent: z.coerce.number().int().min(0).max(200),
  hoursWorked: zMoney,
  executedArea: zMoney,
  areaId: zOptUuid,
  activities: zOptText(4000),
  interferences: zOptText(2000),
  delays: zOptText(2000),
  visits: zOptText(2000),
  occurrences: zOptText(2000),
  notes: zOptText(2000),
  equipmentUsed: zOptText(1000),
  sign: z.string().optional(),
});

export async function createDailyLogAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("field:use");
    const d = dailyLogSchema.parse(formToObject(fd));
    if (d.executedArea > 0 && !d.areaId) return { ok: false, error: "Informe em qual área os m² foram executados.", fieldErrors: { areaId: "Selecione a área" } };
    const r = await createDailyLog(await actorFrom(user), { ...d, sign: d.sign === "on" });
    revalidatePath(`/obras/${d.projectId}`);
    return { ok: true, message: r.duplicated ? "Este diário já tinha sido enviado." : "Diário registrado." };
  });
}

const consumptionSchema = z.object({
  projectId: zUuid,
  productId: zUuid,
  batchId: zOptUuid,
  fromWarehouseId: zUuid,
  quantity: zPositive,
  areaId: zOptUuid,
  employeeId: zOptUuid,
  date: zOptDate,
  notes: zOptText(300),
  type: z.enum(["consumo", "perda", "devolucao"]).default("consumo"),
  toWarehouseId: zOptUuid,
  clientUuid: z.string().uuid().optional(),
});

export async function registerConsumptionAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("stock:move");
    const raw = formToObject(fd);
    if (raw.batchProduct) {
      const [productId, batchId] = raw.batchProduct.split("|");
      raw.productId = productId;
      raw.batchId = batchId || undefined;
    }
    const d = consumptionSchema.parse(raw);
    const r = await registerStockMovement(await actorFrom(user), d);
    revalidatePath(`/obras/${d.projectId}`);
    return { ok: true, message: r.duplicated ? "Movimento já registrado." : d.type === "consumo" ? "Consumo lançado: estoque e custo da obra atualizados." : "Movimento registrado." };
  });
}

export async function createMeasurementAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("measurements:edit");
    const raw = formToObject(fd);
    const base = z.object({ projectId: zUuid, periodStart: zDate, periodEnd: zDate, notes: zOptText(2000) }).parse(raw);
    const areaIds = Object.keys(raw).filter((k) => k.startsWith("qty_")).map((k) => k.slice(4));
    const items = areaIds.map((areaId) => ({
      areaId: zUuid.parse(areaId),
      quantity: zOptNumber.parse(raw[`qty_${areaId}`]) ?? 0,
      unitPrice: zMoney.parse(raw[`price_${areaId}`] ?? "0"),
    }));
    const m = await createMeasurement(await actorFrom(user), base.projectId, { ...base, items });
    revalidatePath(`/obras/${base.projectId}`);
    return { ok: true, message: `Medição ${m.number} registrada. Agora aguarda aprovação.` };
  });
}

export async function approveMeasurementAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("measurements:approve");
    const { measurementId, projectId } = z.object({ measurementId: zUuid, projectId: zUuid }).parse(formToObject(fd));
    await approveMeasurement(await actorFrom(user), measurementId);
    revalidatePath(`/obras/${projectId}`);
    return { ok: true, message: "Medição aprovada." };
  });
}

export async function invoiceMeasurementAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission(["measurements:approve", "finance:edit"]);
    const { measurementId, projectId, dueDate } = z.object({ measurementId: zUuid, projectId: zUuid, dueDate: zDate }).parse(formToObject(fd));
    await invoiceMeasurement(await actorFrom(user), measurementId, dueDate);
    revalidatePath(`/obras/${projectId}`);
    revalidatePath("/financeiro/receber");
    return { ok: true, message: "Medição faturada: conta a receber criada." };
  });
}

const ncSchema = z.object({
  projectId: zUuid,
  title: zText(200),
  description: zOptText(4000),
  severity: z.enum(["baixa", "media", "alta", "critica"]),
  areaId: zOptUuid,
  cause: zOptText(120),
  correctiveAction: zOptText(4000),
  dueDate: zOptDate,
  isRework: z.string().optional(),
  estimatedReworkCost: zOptNumber,
  clientUuid: z.string().uuid().optional(),
});

export async function createNonconformityAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("quality:edit");
    const d = ncSchema.parse(formToObject(fd));
    await createNonconformity(await actorFrom(user), d.projectId, { ...d, isRework: d.isRework === "on" });
    revalidatePath(`/obras/${d.projectId}`);
    return { ok: true, message: "Ocorrência registrada." };
  });
}

export async function updateNcStatusAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("quality:edit");
    const d = z.object({ id: zUuid, projectId: zUuid, status: z.enum(["aberta", "em_tratamento", "resolvida", "cancelada"]), correctiveAction: zOptText(4000) }).parse(formToObject(fd));
    await updateNonconformityStatus(await actorFrom(user), d.id, d.status, d.correctiveAction);
    revalidatePath(`/obras/${d.projectId}`);
    return { ok: true, message: "Não conformidade atualizada." };
  });
}

export async function tightnessTestAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("quality:edit");
    const d = z
      .object({ projectId: zUuid, areaId: zOptUuid, startedAt: z.string().min(10), endedAt: z.string().optional(), initialCondition: zOptText(2000), result: zOptText(2000), approved: z.enum(["sim", "nao"]), notes: zOptText(2000) })
      .parse(formToObject(fd));
    const r = await recordTightnessTest(await actorFrom(user), {
      ...d,
      startedAt: new Date(`${d.startedAt}:00-03:00`),
      endedAt: d.endedAt ? new Date(`${d.endedAt}:00-03:00`) : null,
      approved: d.approved === "sim",
    });
    revalidatePath(`/obras/${d.projectId}`);
    return { ok: true, message: r.nonconformityId ? "Teste reprovado registrado. Uma não conformidade foi aberta automaticamente." : "Teste aprovado registrado." };
  });
}

export async function deliveryTermAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("projects:edit");
    const d = z.object({ projectId: zUuid, deliveredAt: zDate, companySignerName: zText(120), clientSignerName: zText(120), notes: zOptText(2000) }).parse(formToObject(fd));
    const r = await signDeliveryTerm(await actorFrom(user), d.projectId, d);
    revalidatePath(`/obras/${d.projectId}`);
    return { ok: true, message: `Entrega registrada. ${r.warranties} garantia(s) iniciada(s).` };
  });
}

export async function additionAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission(["projects:edit", "projects:finance"]);
    const d = z.object({ projectId: zUuid, description: zText(500), quantity: zOptNumber, unit: zOptText(10), value: zPositive, extraDays: z.coerce.number().int().min(0).default(0) }).parse(formToObject(fd));
    const r = await addContractAddition(await actorFrom(user), d.projectId, d);
    revalidatePath(`/obras/${d.projectId}`);
    return { ok: true, message: r.autoApproved ? "Aditivo registrado e aprovado." : `Aditivo registrado. Aguardando aprovação de: ${r.requiredRole}.` };
  });
}

export async function taskProgressAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("projects:edit");
    const d = z.object({ taskId: zUuid, projectId: zUuid, progress: zNumber }).parse(formToObject(fd));
    await updateTaskProgress(await actorFrom(user), d.taskId, d.progress);
    revalidatePath(`/obras/${d.projectId}`);
    return { ok: true };
  });
}

export async function uploadPhotoAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("field:use");
    const d = z
      .object({ projectId: zUuid, stage: z.enum(["antes", "durante", "depois", "nao_conformidade", "correcao", "entrega"]), areaId: zOptUuid, caption: zOptText(200) })
      .parse(formToObject(fd));
    const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return { ok: false, error: "Selecione ao menos uma foto." };
    if (files.length > 20) return { ok: false, error: "Envie no máximo 20 fotos por vez." };
    const actor = await actorFrom(user);
    for (const file of files) {
      const saved = await saveUpload(user.companyId, user.id, file, `obras/${d.projectId}/fotos`);
      if (saved.kind !== "photo") return { ok: false, error: `"${file.name}" não é uma foto.` };
      await addProjectPhoto(actor, d.projectId, { ...d, fileId: saved.id });
    }
    revalidatePath(`/obras/${d.projectId}`);
    return { ok: true, message: `${files.length} foto(s) enviada(s).` };
  });
}

