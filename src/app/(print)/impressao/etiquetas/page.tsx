import type { Metadata } from "next";
import QRCode from "qrcode";
import { asc, eq } from "drizzle-orm";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { equipment, productBatches, products } from "@/server/db/schema";
import { env } from "@/server/env";
import { date } from "@/lib/format";

export const metadata: Metadata = { title: "Etiquetas QR" };

/** Etiquetas QR (§39) para patrimônio e lotes de material. Cada código abre /qr/... no celular. */
export default async function Etiquetas({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const user = await requireUser("stock:view");
  const { tipo = "patrimonio" } = await searchParams;
  const items =
    tipo === "lotes"
      ? (
          await db
            .select({ b: productBatches, name: products.name, sku: products.sku })
            .from(productBatches)
            .innerJoin(products, eq(products.id, productBatches.productId))
            .where(eq(products.companyId, user.companyId))
            .orderBy(asc(products.name))
        ).map((x) => ({ code: `L:${x.b.id}`, title: x.name, sub: `Lote ${x.b.batchNumber}${x.b.expiresAt ? `, val. ${date(x.b.expiresAt)}` : ""}` }))
      : (await db.select().from(equipment).where(eq(equipment.companyId, user.companyId)).orderBy(asc(equipment.assetTag))).map((e) => ({ code: `P:${e.assetTag}`, title: e.name, sub: e.assetTag }));
  const svgs = await Promise.all(items.map((i) => QRCode.toString(`${env.APP_URL}/qr/${encodeURIComponent(i.code)}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" })));
  return (
    <>
      <h1 className="font-display no-print mb-4 text-xl font-semibold">Etiquetas QR: {tipo === "lotes" ? "lotes de material" : "patrimônio"}</h1>
      <div className="grid grid-cols-3 gap-3">
        {items.map((i, idx) => (
          <div key={i.code} className="flex break-inside-avoid items-center gap-2 rounded border border-border p-2">
            <div className="size-20 shrink-0" dangerouslySetInnerHTML={{ __html: svgs[idx] }} />
            <div className="min-w-0 text-[10px] leading-tight">
              <p className="font-display text-[13px] font-semibold">{i.sub}</p>
              <p className="line-clamp-3">{i.title}</p>
              <p className="mt-1 text-muted">Revolution Imper</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
