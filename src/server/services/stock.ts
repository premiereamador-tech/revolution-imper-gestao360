import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { productBatches, products, stockMovements, warehouses } from "@/server/db/schema";
import { addDays, todayISO } from "@/domain/dates";

const n = (v: unknown) => Number(v ?? 0);

/** Saldo por produto × depósito × lote, calculado a partir do livro de movimentações. */
export async function stockBalances(companyId: string) {
  const res = await db.execute<{ product_id: string; warehouse_id: string; batch_id: string | null; qty: string }>(sql`
    select product_id, warehouse_id, batch_id, sum(delta) as qty from (
      select product_id, to_warehouse_id as warehouse_id, batch_id,
             case when type = 'ajuste' then quantity else abs(quantity) end as delta
        from ${stockMovements} where company_id = ${companyId} and to_warehouse_id is not null
      union all
      select product_id, from_warehouse_id, batch_id, -abs(quantity)
        from ${stockMovements} where company_id = ${companyId} and from_warehouse_id is not null and type <> 'ajuste'
    ) x group by product_id, warehouse_id, batch_id
    having abs(sum(delta)) > 0.0005`);
  return res.rows.map((r) => ({ productId: r.product_id, warehouseId: r.warehouse_id, batchId: r.batch_id, qty: Math.round(n(r.qty) * 1000) / 1000 }));
}

export async function stockOverview(companyId: string) {
  const today = todayISO();
  const [prods, whs, batches, balances] = await Promise.all([
    db.select().from(products).where(and(eq(products.companyId, companyId), eq(products.active, true))).orderBy(products.category, products.name),
    db.select().from(warehouses).where(eq(warehouses.companyId, companyId)),
    db
      .select({ b: productBatches })
      .from(productBatches)
      .innerJoin(products, eq(products.id, productBatches.productId))
      .where(eq(products.companyId, companyId)),
    stockBalances(companyId),
  ]);
  const batchMap = new Map(batches.map((x) => [x.b.id, x.b]));
  const whMap = new Map(whs.map((w) => [w.id, w]));

  const rows = prods.map((p) => {
    const bal = balances.filter((b) => b.productId === p.id);
    const total = bal.reduce((s, b) => s + b.qty, 0);
    const central = bal.filter((b) => whMap.get(b.warehouseId)?.type === "central").reduce((s, b) => s + b.qty, 0);
    const batchesWithQty = bal
      .filter((b) => b.batchId && b.qty > 0)
      .map((b) => ({ ...batchMap.get(b.batchId!)!, qty: b.qty, warehouse: whMap.get(b.warehouseId)?.name ?? "" }));
    const expired = batchesWithQty.filter((b) => b.expiresAt && b.expiresAt < today);
    const expiring = batchesWithQty.filter((b) => b.expiresAt && b.expiresAt >= today && b.expiresAt <= addDays(today, 30));
    const blocked = batchesWithQty.filter((b) => b.blocked);
    return {
      ...p,
      total: Math.round(total * 1000) / 1000,
      central: Math.round(central * 1000) / 1000,
      value: Math.round(total * p.averageCost * 100) / 100,
      belowMin: central < p.minStock,
      expired: expired.length,
      expiring: expiring.length,
      blocked: blocked.length,
      batches: batchesWithQty,
      byWarehouse: bal.map((b) => ({ warehouse: whMap.get(b.warehouseId)?.name ?? "", type: whMap.get(b.warehouseId)?.type, qty: b.qty })),
    };
  });

  return {
    rows,
    warehouses: whs,
    totalValue: Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100,
    alerts: {
      lowStock: rows.filter((r) => r.belowMin).length,
      expired: rows.reduce((s, r) => s + r.expired, 0),
      expiring: rows.reduce((s, r) => s + r.expiring, 0),
      blocked: rows.reduce((s, r) => s + r.blocked, 0),
      noSheet: rows.filter((r) => !r.hasTechnicalSheet).length,
    },
  };
}
