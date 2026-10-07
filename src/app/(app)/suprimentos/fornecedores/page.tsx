import type { Metadata } from "next";
import { asc, desc, eq, sql } from "drizzle-orm";
import { saveSupplierAction } from "../actions";
import { Input, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Card, CardHeader, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { formatCNPJ, formatPhone } from "@/domain/br";
import { date, money, number } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { accountsPayable, products, purchaseOrderItems, purchaseOrders, suppliers } from "@/server/db/schema";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function FornecedoresPage() {
  const user = await requireUser("stock:view");
  const [rows, prices] = await Promise.all([
    db
      .select({
        s: suppliers,
        orders: sql<string>`(select count(*) from ${purchaseOrders} po where po.supplier_id = "suppliers"."id")`,
        bought: sql<string>`coalesce((select sum(total) from ${purchaseOrders} po where po.supplier_id = "suppliers"."id"), 0)`,
        lastOrder: sql<string | null>`(select max(created_at)::date::text from ${purchaseOrders} po where po.supplier_id = "suppliers"."id")`,
        open: sql<string>`coalesce((select sum(amount - paid_amount) from ${accountsPayable} ap where ap.supplier_id = "suppliers"."id" and not ap.cancelled), 0)`,
      })
      .from(suppliers)
      .where(eq(suppliers.companyId, user.companyId))
      .orderBy(asc(suppliers.legalName)),
    db
      .select({ product: products.name, unit: products.unit, supplier: sql<string>`coalesce(${suppliers.tradeName}, ${suppliers.legalName})`, price: purchaseOrderItems.unitPrice, at: purchaseOrders.createdAt })
      .from(purchaseOrderItems)
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderItems.orderId))
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .innerJoin(products, eq(products.id, purchaseOrderItems.productId))
      .where(eq(purchaseOrders.companyId, user.companyId))
      .orderBy(asc(products.name), desc(purchaseOrders.createdAt)),
  ]);
  const byProduct = new Map<string, Array<{ supplier: string; price: number; unit: string; at: Date }>>();
  for (const p of prices) {
    const list = byProduct.get(p.product) ?? [];
    if (!list.some((x) => x.supplier === p.supplier)) list.push({ supplier: p.supplier, price: p.price, unit: p.unit, at: p.at });
    byProduct.set(p.product, list);
  }
  return (
    <>
      <PageHeader
        title="Fornecedores"
        description="Cadastro, histórico de compras, saldo a pagar, avaliação e comparação de preços pagos."
        actions={
          can(user, "suppliers:edit") && (
            <FormModal trigger="Novo fornecedor" title="Novo fornecedor" action={saveSupplierAction} wide>
              <div className="grid gap-3 md:grid-cols-2">
                <Input name="legalName" label="Razão social" required />
                <Input name="tradeName" label="Nome fantasia" />
                <Input name="cnpj" label="CNPJ" inputMode="numeric" />
                <Input name="contactName" label="Contato" />
                <Input name="phone" label="Telefone" inputMode="tel" />
                <Input name="whatsapp" label="WhatsApp" inputMode="tel" />
                <Input name="email" label="E-mail" type="email" />
                <Input name="paymentTermDays" label="Prazo de pagamento (dias)" type="number" min={0} />
                <Input name="rating" label="Avaliação (1 a 5)" inputMode="decimal" />
              </div>
              <Textarea name="productsSupplied" label="Produtos fornecidos" rows={2} />
              <Textarea name="commercialTerms" label="Condições comerciais" rows={2} />
            </FormModal>
          )
        }
      />
      <Card className="mb-6">
        <Table>
          <thead>
            <tr>
              <Th>Fornecedor</Th>
              <Th>Contato</Th>
              <Th>Produtos</Th>
              <Th align="right">Prazo</Th>
              <Th align="right">Pedidos</Th>
              <Th align="right">Comprado</Th>
              <Th align="right">A pagar</Th>
              <Th align="right">Avaliação</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, orders, bought, lastOrder, open }) => (
              <tr key={s.id}>
                <Td>
                  <p className="font-medium">{s.tradeName ?? s.legalName}</p>
                  <p className="text-[12px] text-muted">{s.cnpj ? formatCNPJ(s.cnpj) : s.legalName}</p>
                </Td>
                <Td className="text-[13px]">
                  {s.contactName}
                  <p className="text-muted">{formatPhone(s.whatsapp ?? s.phone)}</p>
                </Td>
                <Td className="max-w-56 text-[13px]">{s.productsSupplied}</Td>
                <Td align="right">{s.paymentTermDays ? `${s.paymentTermDays} d` : "—"}</Td>
                <Td align="right">
                  {orders}
                  {lastOrder && <p className="text-[11px] text-muted">último {date(lastOrder)}</p>}
                </Td>
                <Td align="right">{money(Number(bought))}</Td>
                <Td align="right">{money(Number(open))}</Td>
                <Td align="right">{s.rating ? `${number(s.rating, 1)} / 5` : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Comparativo de preços pagos" description="Último preço unitário por fornecedor em cada produto." />
        <Table>
          <thead>
            <tr>
              <Th>Produto</Th>
              <Th>Fornecedores e último preço</Th>
            </tr>
          </thead>
          <tbody>
            {[...byProduct.entries()].map(([product, list]) => {
              const min = Math.min(...list.map((l) => l.price));
              return (
                <tr key={product}>
                  <Td>{product}</Td>
                  <Td className="text-[13px]">
                    {list.map((l) => (
                      <span key={l.supplier} className={l.price === min && list.length > 1 ? "mr-4 font-medium text-success" : "mr-4"}>
                        {l.supplier}: {money(l.price)}/{l.unit}
                      </span>
                    ))}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
