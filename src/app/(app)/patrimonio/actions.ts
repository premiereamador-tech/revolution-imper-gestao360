"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { todayISO } from "@/domain/dates";
import { actorFrom, formToObject, runAction, zDate, zMoney, zOptDate, zOptText, zOptUuid, zText, zUuid } from "@/server/action-helpers";
import { assertPermission } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { equipment, equipmentMaintenance, equipmentMovements, warehouses } from "@/server/db/schema";

async function own(companyId: string, id: string) {
  const [e] = await db.select().from(equipment).where(and(eq(equipment.id, id), eq(equipment.companyId, companyId))).limit(1);
  return e;
}

export async function saveEquipmentAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("equipment:edit");
    const d = z.object({ assetTag: zText(30), name: zText(160), category: z.enum(["equipamento", "ferramenta", "epi_coletivo"]), brand: zOptText(80), acquisitionValue: zMoney.optional(), nextMaintenanceAt: zOptDate }).parse(formToObject(fd));
    const [central] = await db.select().from(warehouses).where(and(eq(warehouses.companyId, user.companyId), eq(warehouses.type, "central"))).limit(1);
    const [e] = await db.insert(equipment).values({ ...d, companyId: user.companyId, currentWarehouseId: central?.id }).returning();
    await audit(db, await actorFrom(user), "equipment.create", "equipment", e.id, undefined, d);
    revalidatePath("/patrimonio");
    return { ok: true, message: "Item cadastrado." };
  });
}

export async function checkoutAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("equipment:edit");
    const d = z.object({ id: zUuid, projectId: zOptUuid, employeeId: zUuid, expectedReturnAt: zOptDate, notes: zOptText(300) }).parse(formToObject(fd));
    const e = await own(user.companyId, d.id);
    if (!e) return { ok: false, error: "Item não encontrado." };
    if (e.status === "em_uso") return { ok: false, error: "Item já está em uso. Registre a devolução antes." };
    if (e.status === "manutencao" || e.status === "baixado") return { ok: false, error: "Item indisponível (manutenção ou baixado)." };
    const today = todayISO();
    await db.update(equipment).set({ status: "em_uso", currentProjectId: d.projectId ?? null, currentHolderId: d.employeeId, currentWarehouseId: null, checkedOutAt: today, expectedReturnAt: d.expectedReturnAt }).where(eq(equipment.id, d.id));
    await db.insert(equipmentMovements).values({ equipmentId: d.id, type: "retirada", projectId: d.projectId, employeeId: d.employeeId, date: today, expectedReturnAt: d.expectedReturnAt, notes: d.notes, createdById: user.id });
    await audit(db, await actorFrom(user), "equipment.checkout", "equipment", d.id, { status: e.status }, d);
    revalidatePath("/patrimonio");
    return { ok: true, message: "Retirada registrada." };
  });
}

export async function returnAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("equipment:edit");
    const d = z.object({ id: zUuid, notes: zOptText(300), needsMaintenance: z.string().optional() }).parse(formToObject(fd));
    const e = await own(user.companyId, d.id);
    if (!e) return { ok: false, error: "Item não encontrado." };
    const [central] = await db.select().from(warehouses).where(and(eq(warehouses.companyId, user.companyId), eq(warehouses.type, "central"))).limit(1);
    await db
      .update(equipment)
      .set({ status: d.needsMaintenance === "on" ? "manutencao" : "disponivel", currentProjectId: null, currentHolderId: null, currentWarehouseId: central?.id, checkedOutAt: null, expectedReturnAt: null })
      .where(eq(equipment.id, d.id));
    await db.insert(equipmentMovements).values({ equipmentId: d.id, type: "devolucao", projectId: e.currentProjectId, employeeId: e.currentHolderId, date: todayISO(), notes: d.notes, createdById: user.id });
    await audit(db, await actorFrom(user), "equipment.return", "equipment", d.id, { status: e.status }, d);
    revalidatePath("/patrimonio");
    return { ok: true, message: "Devolução registrada." };
  });
}

export async function maintenanceAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("equipment:edit");
    const d = z.object({ id: zUuid, kind: z.enum(["preventiva", "corretiva"]), date: zDate, cost: zMoney, supplierId: zOptUuid, description: zOptText(2000), nextReviewAt: zOptDate }).parse(formToObject(fd));
    const e = await own(user.companyId, d.id);
    if (!e) return { ok: false, error: "Item não encontrado." };
    await db.insert(equipmentMaintenance).values({ equipmentId: d.id, kind: d.kind, date: d.date, cost: d.cost, supplierId: d.supplierId, description: d.description, nextReviewAt: d.nextReviewAt });
    await db.update(equipment).set({ nextMaintenanceAt: d.nextReviewAt ?? e.nextMaintenanceAt, status: e.status === "manutencao" ? "disponivel" : e.status }).where(eq(equipment.id, d.id));
    await audit(db, await actorFrom(user), "equipment.maintenance", "equipment", d.id, undefined, d);
    revalidatePath("/patrimonio");
    return { ok: true, message: "Manutenção registrada." };
  });
}
