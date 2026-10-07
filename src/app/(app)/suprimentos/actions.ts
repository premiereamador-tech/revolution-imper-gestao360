"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { isValidCNPJ, onlyDigits } from "@/domain/br";
import { actorFrom, formToObject, runAction, zMoney, zOptDate, zOptNumber, zOptText, zOptUuid, zPositive, zText, zUuid, zNumber } from "@/server/action-helpers";
import { assertPermission } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { db } from "@/server/db";
import { productBatches, products, suppliers, warehouses } from "@/server/db/schema";
import { registerStockMovement } from "@/server/services/automations";

export async function stockMovementAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("stock:move");
    const raw = formToObject(fd);
    const d = z
      .object({
        type: z.enum(["entrada", "saida", "transferencia", "devolucao", "perda", "ajuste"]),
        productId: zUuid,
        batchId: zOptUuid,
        newBatchNumber: zOptText(60),
        expiresAt: zOptDate,
        supplierId: zOptUuid,
        fromWarehouseId: zOptUuid,
        toWarehouseId: zOptUuid,
        quantity: d0(raw.type === "ajuste"),
        unitCost: zOptNumber,
        date: zOptDate,
        notes: zOptText(300),
      })
      .parse(raw);
    const [product] = await db.select().from(products).where(and(eq(products.id, d.productId), eq(products.companyId, user.companyId))).limit(1);
    if (!product) return { ok: false, error: "Produto não encontrado." };
    let batchId = d.batchId;
    if (d.type === "entrada" && d.newBatchNumber) {
      const [b] = await db
        .insert(productBatches)
        .values({ productId: d.productId, batchNumber: d.newBatchNumber, expiresAt: d.expiresAt, supplierId: d.supplierId })
        .onConflictDoUpdate({ target: [productBatches.productId, productBatches.batchNumber], set: { expiresAt: d.expiresAt } })
        .returning();
      batchId = b.id;
    }
    // Devolução da obra: origem é o estoque da obra, vincula a obra para estornar custo
    let projectId: string | null = null;
    if (d.type === "devolucao" && d.fromWarehouseId) {
      const [w] = await db.select().from(warehouses).where(eq(warehouses.id, d.fromWarehouseId)).limit(1);
      projectId = w?.projectId ?? null;
    }
    if ((d.type === "perda" || d.type === "saida") && d.fromWarehouseId) {
      const [w] = await db.select().from(warehouses).where(eq(warehouses.id, d.fromWarehouseId)).limit(1);
      projectId = w?.projectId ?? null;
    }
    await registerStockMovement(await actorFrom(user), { ...d, batchId, projectId });
    revalidatePath("/suprimentos/estoque");
    return { ok: true, message: "Movimentação registrada." };
  });
}

function d0(isAdjust: boolean) {
  return isAdjust ? zNumber : zPositive;
}

export async function saveProductAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("stock:move");
    const d = z
      .object({ sku: zText(40), name: zText(200), manufacturer: zOptText(120), category: zText(80), unit: zText(10), averageCost: zMoney, minStock: zMoney, hasTechnicalSheet: z.string().optional() })
      .parse(formToObject(fd));
    const [p] = await db.insert(products).values({ ...d, hasTechnicalSheet: d.hasTechnicalSheet === "on", companyId: user.companyId }).returning();
    await audit(db, await actorFrom(user), "product.create", "product", p.id, undefined, d);
    revalidatePath("/suprimentos/estoque");
    return { ok: true, message: "Produto cadastrado." };
  });
}

export async function blockBatchAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("stock:move");
    const d = z.object({ id: zUuid, blocked: z.enum(["sim", "nao"]), reason: zOptText(200) }).parse(formToObject(fd));
    const [b] = await db.select({ b: productBatches }).from(productBatches).innerJoin(products, eq(products.id, productBatches.productId)).where(and(eq(productBatches.id, d.id), eq(products.companyId, user.companyId))).limit(1);
    if (!b) return { ok: false, error: "Lote não encontrado." };
    await db.update(productBatches).set({ blocked: d.blocked === "sim", blockReason: d.blocked === "sim" ? d.reason : null }).where(eq(productBatches.id, d.id));
    await audit(db, await actorFrom(user), "batch.block", "product_batch", d.id, { blocked: b.b.blocked }, d);
    revalidatePath("/suprimentos/estoque");
    return { ok: true, message: d.blocked === "sim" ? "Lote bloqueado para uso." : "Lote liberado." };
  });
}

export async function saveSupplierAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("suppliers:edit");
    const d = z
      .object({
        legalName: zText(200),
        tradeName: zOptText(200),
        cnpj: zOptText(18),
        contactName: zOptText(120),
        phone: zOptText(20),
        whatsapp: zOptText(20),
        email: z.string().email("E-mail inválido").optional(),
        productsSupplied: zOptText(2000),
        commercialTerms: zOptText(2000),
        paymentTermDays: zOptNumber,
        rating: zOptNumber,
      })
      .superRefine((x, ctx) => {
        if (x.cnpj && !isValidCNPJ(x.cnpj)) ctx.addIssue({ code: "custom", path: ["cnpj"], message: "CNPJ inválido" });
        if (x.rating !== undefined && (x.rating < 1 || x.rating > 5)) ctx.addIssue({ code: "custom", path: ["rating"], message: "De 1 a 5" });
      })
      .parse(formToObject(fd));
    const [s] = await db.insert(suppliers).values({ ...d, cnpj: d.cnpj ? onlyDigits(d.cnpj) : null, companyId: user.companyId }).returning();
    await audit(db, await actorFrom(user), "supplier.create", "supplier", s.id, undefined, d);
    revalidatePath("/suprimentos/fornecedores");
    return { ok: true, message: "Fornecedor cadastrado." };
  });
}

export async function createWarehouseAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await assertPermission("stock:move");
    const d = z.object({ name: zText(120), vehiclePlate: zOptText(10) }).parse(formToObject(fd));
    await db.insert(warehouses).values({ companyId: user.companyId, name: d.name, type: "veiculo", vehiclePlate: d.vehiclePlate });
    revalidatePath("/suprimentos/estoque");
    return { ok: true, message: "Estoque de veículo criado." };
  });
}
