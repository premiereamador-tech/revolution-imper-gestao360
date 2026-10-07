import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { blockBatchAction, createWarehouseAction, saveProductAction, stockMovementAction } from "../actions";
import { MovementFields } from "./movement-fields";
import { FilterBar } from "@/components/ui/filter-bar";
import { Checkbox, Input, MoneyInput, Select } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardHeader, EmptyState, Kpi, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { batchAlert } from "@/domain/stock";
import { todayISO } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { date, money, moneyShort, number } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { products, productBatches, stockMovements, warehouses } from "@/server/db/schema";
import { financeOptions } from "@/server/services/options";
import { stockOverview } from "@/server/services/stock";

export const metadata: Metadata = { title: "Estoque" };
const MOVE: Record<string, string> = { entrada: "Entrada", saida: "Saída", transferencia: "Transferência", devolucao: "Devolução", perda: "Perda", consumo: "Consumo", ajuste: "Ajuste" };

export default async function EstoquePage({ searchParams }: { searchParams: Promise<{ alerta?: string; q?: string; categoria?: string; deposito?: string }> }) {
  const user = await requireUser("stock:view");
  const f = await searchParams;
  const today = todayISO();
  const [s, opts, recent, allBatches] = await Promise.all([
    stockOverview(user.companyId),
    financeOptions(user.companyId),
    db
      .select({ m: stockMovements, product: products.name, unit: products.unit, from: warehouses.name })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .leftJoin(warehouses, eq(warehouses.id, stockMovements.fromWarehouseId))
      .where(and(eq(stockMovements.companyId, user.companyId)))
      .orderBy(desc(stockMovements.createdAt))
      .limit(25),
    db.select({ b: productBatches }).from(productBatches).innerJoin(products, eq(products.id, productBatches.productId)).where(eq(products.companyId, user.companyId)),
  ]);
  const whName = new Map(s.warehouses.map((w) => [w.id, w.name]));
  let rows = s.rows;
  if (f.alerta === "minimo") rows = rows.filter((r) => r.belowMin);
  if (f.alerta === "vencido") rows = rows.filter((r) => r.expired);
  if (f.alerta === "vencendo") rows = rows.filter((r) => r.expiring);
  if (f.alerta === "ficha") rows = rows.filter((r) => !r.hasTechnicalSheet);
  if (f.alerta === "bloqueado") rows = rows.filter((r) => r.blocked);
  if (f.categoria) rows = rows.filter((r) => r.category === f.categoria);
  if (f.q) rows = rows.filter((r) => `${r.sku} ${r.name} ${r.manufacturer ?? ""}`.toLowerCase().includes(f.q!.toLowerCase()));
  if (f.deposito) rows = rows.filter((r) => r.byWarehouse.some((w) => w.warehouse === whName.get(f.deposito!)));
  const categories = [...new Set(s.rows.map((r) => r.category))];
  const canMove = can(user, "stock:move");

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Central, por obra e por veículo. Saldo calculado pelo histórico de movimentações (entrada, transferência, consumo, devolução, perda)."
        actions={
          <>
            <LinkButton href="/api/export/estoque" variant="secondary" prefetch={false}>
              Exportar Excel/CSV
            </LinkButton>
            <LinkButton href="/impressao/etiquetas?tipo=lotes" variant="secondary" target="_blank" prefetch={false}>
              Etiquetas QR
            </LinkButton>
            {canMove && (
              <>
                <FormModal trigger="Novo produto" title="Cadastrar produto" action={saveProductAction} variant="secondary">
                  <div className="grid grid-cols-2 gap-3">
                    <Input name="sku" label="Código (SKU)" required />
                    <Input name="category" label="Categoria" required list="cats" />
                    <Input name="name" label="Descrição" required wrapClassName="col-span-2" />
                    <Input name="manufacturer" label="Fabricante" />
                    <Select name="unit" label="Unidade" options={["m²", "kg", "L", "un", "rolo", "m"].map((u) => ({ value: u, label: u }))} />
                    <MoneyInput name="averageCost" label="Custo inicial" />
                    <Input name="minStock" label="Estoque mínimo" inputMode="decimal" defaultValue="0" />
                  </div>
                  <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                  <Checkbox name="hasTechnicalSheet" label="Possui ficha técnica cadastrada" />
                </FormModal>
                <FormModal trigger="Estoque de veículo" title="Novo estoque de veículo" action={createWarehouseAction} variant="secondary">
                  <Input name="name" label="Nome" placeholder="Ex.: Caminhão Equipe B" required />
                  <Input name="vehiclePlate" label="Placa" />
                </FormModal>
                <FormModal trigger="Movimentar estoque" title="Movimentação de estoque" description="Consumo em obra é lançado pela própria obra (aba Materiais) ou pelo app de campo." action={stockMovementAction} wide>
                  <MovementFields
                    today={today}
                    products={s.rows.map((r) => ({ value: r.id, label: `${r.sku} ${r.name}`, unit: r.unit, cost: r.averageCost }))}
                    batches={allBatches.map(({ b }) => ({ id: b.id, productId: b.productId, label: `${b.batchNumber}${b.expiresAt ? `, val. ${date(b.expiresAt)}` : ""}${b.blocked ? " (bloqueado)" : ""}` }))}
                    warehouses={s.warehouses.filter((w) => w.active).map((w) => ({ value: w.id, label: w.name }))}
                    suppliers={opts.suppliers}
                  />
                </FormModal>
              </>
            )}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Valor em estoque" value={moneyShort(s.totalValue)} hint="Custo médio × saldo" />
        <Kpi label="Abaixo do mínimo" value={s.alerts.lowStock} tone={s.alerts.lowStock ? "warning" : "default"} href="/suprimentos/estoque?alerta=minimo" />
        <Kpi label="Lotes vencidos" value={s.alerts.expired} tone={s.alerts.expired ? "negative" : "default"} href="/suprimentos/estoque?alerta=vencido" />
        <Kpi label="Lotes vencendo (30 dias)" value={s.alerts.expiring} tone={s.alerts.expiring ? "warning" : "default"} href="/suprimentos/estoque?alerta=vencendo" />
        <Kpi label="Lotes bloqueados" value={s.alerts.blocked} href="/suprimentos/estoque?alerta=bloqueado" />
        <Kpi label="Sem ficha técnica" value={s.alerts.noSheet} href="/suprimentos/estoque?alerta=ficha" />
      </div>
      <FilterBar
        fields={[
          { name: "q", label: "Buscar", type: "search", placeholder: "Código, produto, fabricante" },
          { name: "categoria", label: "Categoria", type: "select", options: categories.map((c) => ({ value: c, label: c })) },
          { name: "deposito", label: "Estoque", type: "select", options: s.warehouses.map((w) => ({ value: w.id, label: w.name })) },
          { name: "alerta", label: "Alerta", type: "select", options: [{ value: "minimo", label: "Abaixo do mínimo" }, { value: "vencido", label: "Lote vencido" }, { value: "vencendo", label: "Lote vencendo" }, { value: "bloqueado", label: "Lote bloqueado" }, { value: "ficha", label: "Sem ficha técnica" }] },
        ]}
      />
      <Card className="mb-6">
        {rows.length === 0 ? (
          <EmptyState title="Nenhum produto encontrado" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Categoria</Th>
                <Th align="right">Central</Th>
                <Th align="right">Total (todas as obras)</Th>
                <Th align="right">Mínimo</Th>
                <Th align="right">Custo médio</Th>
                <Th align="right">Valor</Th>
                <Th>Lotes</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn(r.belowMin && "bg-warning-soft/40")}>
                  <Td className="min-w-64">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-[12px] text-muted">
                      {r.sku}, {r.manufacturer}
                      {!r.hasTechnicalSheet && <Badge tone="amber" className="ml-1.5">sem ficha técnica</Badge>}
                    </p>
                  </Td>
                  <Td>{r.category}</Td>
                  <Td align="right" className={r.belowMin ? "font-medium text-[#8a5800]" : ""}>
                    {number(r.central)} {r.unit}
                  </Td>
                  <Td align="right">
                    {number(r.total)} {r.unit}
                  </Td>
                  <Td align="right">{number(r.minStock)}</Td>
                  <Td align="right">{money(r.averageCost)}</Td>
                  <Td align="right">{money(r.value)}</Td>
                  <Td className="min-w-56">
                    {r.batches.length === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <details>
                        <summary className="cursor-pointer text-[13px] text-primary">
                          {r.batches.length} lote(s)
                          {r.expired > 0 && <Badge tone="red" className="ml-1.5">vencido</Badge>}
                          {r.expiring > 0 && <Badge tone="amber" className="ml-1.5">vencendo</Badge>}
                          {r.blocked > 0 && <Badge tone="slate" className="ml-1.5">bloqueado</Badge>}
                        </summary>
                        <ul className="mt-2 space-y-1.5 text-[12px]">
                          {r.batches.map((b, i) => {
                            const al = batchAlert(b, today);
                            return (
                              <li key={`${b.id}-${i}`} className="rounded-md bg-surface-2 px-2 py-1.5">
                                <span className="font-medium">{b.batchNumber}</span> em {b.warehouse}: {number(b.qty)} {r.unit}
                                <span className="block text-muted">
                                  validade {date(b.expiresAt)}
                                  {al && <Badge tone={al === "vencendo" ? "amber" : al === "vencido" ? "red" : "slate"} className="ml-1">{al}</Badge>}
                                </span>
                                {canMove && (
                                  <FormModal trigger={b.blocked ? "Liberar lote" : "Bloquear lote"} title={`Lote ${b.batchNumber}`} action={blockBatchAction} variant="ghost" size="sm">
                                    <input type="hidden" name="id" value={b.id} />
                                    <input type="hidden" name="blocked" value={b.blocked ? "nao" : "sim"} />
                                    {!b.blocked && <Input name="reason" label="Motivo do bloqueio" required />}
                                    {b.blocked && <p className="text-sm">Motivo atual: {b.blockReason}</p>}
                                  </FormModal>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Últimas movimentações" />
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Tipo</Th>
              <Th>Produto</Th>
              <Th>De → para</Th>
              <Th align="right">Quantidade</Th>
            </tr>
          </thead>
          <tbody>
            {recent.map(({ m, product, unit, from }) => (
              <tr key={m.id}>
                <Td className="tabular">{date(m.date)}</Td>
                <Td>{MOVE[m.type]}</Td>
                <Td>
                  {m.projectId ? <Link href={`/obras/${m.projectId}?tab=materiais`} className="hover:text-primary">{product}</Link> : product}
                </Td>
                <Td className="text-[13px]">
                  {from ?? "—"} → {m.toWarehouseId ? whName.get(m.toWarehouseId) : m.type === "consumo" ? "consumido na obra" : "—"}
                </Td>
                <Td align="right">
                  {number(m.quantity)} {unit}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
