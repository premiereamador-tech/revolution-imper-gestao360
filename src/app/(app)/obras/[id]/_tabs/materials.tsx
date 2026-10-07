import { randomUUID } from "node:crypto";
import { registerConsumptionAction } from "../../actions";
import { Input, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui/primitives";
import { batchAlert } from "@/domain/stock";
import { todayISO } from "@/domain/dates";
import { date, money, number, pct } from "@/lib/format";
import { can, type SessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { employees, productBatches, products } from "@/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { projectAreasWithApps, projectMaterialTrace } from "@/server/services/project-detail";
import { stockBalances } from "@/server/services/stock";
import type { Core } from "./types";

const TYPE_LABEL: Record<string, string> = { consumo: "Consumo", transferencia: "Entrega na obra", perda: "Perda", devolucao: "Devolução", entrada: "Entrada", saida: "Saída", ajuste: "Ajuste" };

export async function MaterialsTab({ user, core }: { user: SessionUser; core: Core }) {
  const today = todayISO();
  const [{ moves, planned, warehouse }, areas] = await Promise.all([projectMaterialTrace(core.p.id), projectAreasWithApps(core.p.id)]);
  const balances = warehouse ? (await stockBalances(user.companyId)).filter((b) => b.warehouseId === warehouse.id && b.qty > 0) : [];
  const productIds = [...new Set(balances.map((b) => b.productId))];
  const batchIds = balances.map((b) => b.batchId).filter((x): x is string => !!x);
  const [prods, batches, emps] = await Promise.all([
    productIds.length ? db.select().from(products).where(inArray(products.id, productIds)) : [],
    batchIds.length ? db.select().from(productBatches).where(inArray(productBatches.id, batchIds)) : [],
    db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.companyId, user.companyId)),
  ]);
  const onSite = balances.map((b) => {
    const p = prods.find((x) => x.id === b.productId)!;
    const bt = batches.find((x) => x.id === b.batchId);
    return { ...b, product: p, batch: bt, alert: bt ? batchAlert(bt, today) : null };
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Previsto × consumido por área" description="Consumo real por m² executado comparado ao previsto na ficha técnica." />
          <Table>
            <thead>
              <tr>
                <Th>Área / produto</Th>
                <Th align="right">Previsto</Th>
                <Th align="right">Consumido</Th>
                <Th align="right">Saldo</Th>
                <Th align="right">Desvio/m²</Th>
              </tr>
            </thead>
            <tbody>
              {planned.map((p, i) => {
                const expectedSoFar = p.perM2 ? p.perM2 * p.executedArea : null;
                const dev = expectedSoFar && p.used ? (p.used / expectedSoFar - 1) * 100 : null;
                return (
                  <tr key={i}>
                    <Td>
                      <p className="font-medium">{p.areaName}</p>
                      <p className="text-[12px] text-muted">{p.productName ?? "Produto não definido"}</p>
                    </Td>
                    <Td align="right">{p.planned ? `${number(p.planned)} ${p.unit ?? ""}` : "—"}</Td>
                    <Td align="right">{p.used ? `${number(p.used)} ${p.unit ?? ""}` : "—"}</Td>
                    <Td align="right">{p.planned ? number((p.planned ?? 0) - (p.used ?? 0)) : "—"}</Td>
                    <Td align="right" className={dev !== null && dev >= 10 ? "font-medium text-danger" : ""}>
                      {dev === null ? "—" : `${dev > 0 ? "+" : ""}${pct(dev, 0)}`}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Material na obra agora"
            description={warehouse ? `Estoque: ${warehouse.name}` : "Esta obra ainda não tem estoque próprio."}
            actions={
              warehouse &&
              can(user, "stock:move") &&
              onSite.length > 0 && (
                <FormModal trigger="Lançar consumo" title="Lançar consumo de material" description="Baixa o estoque da obra e soma o custo no resultado." action={registerConsumptionAction} size="sm">
                  <input type="hidden" name="projectId" value={core.p.id} />
                  <input type="hidden" name="fromWarehouseId" value={warehouse.id} />
                  <input type="hidden" name="clientUuid" value={randomUUID()} />
                  <Select
                    name="batchProduct"
                    label="Produto e lote"
                    required
                    options={onSite.map((o) => ({ value: `${o.productId}|${o.batchId ?? ""}`, label: `${o.product.name} | lote ${o.batch?.batchNumber ?? "s/n"} | disponível ${number(o.qty)} ${o.product.unit}` }))}
                    placeholder="Selecione"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input name="quantity" label="Quantidade" inputMode="decimal" required />
                    <Select name="type" label="Tipo" options={[{ value: "consumo", label: "Consumo" }, { value: "perda", label: "Perda" }]} defaultValue="consumo" />
                    <Select name="areaId" label="Área" options={areas.map((a) => ({ value: a.id, label: a.name }))} placeholder="Selecione" />
                    <Select name="employeeId" label="Quem utilizou" options={emps.map((e) => ({ value: e.id, label: e.name }))} placeholder="Selecione" />
                    <Input name="date" type="date" label="Data" defaultValue={today} max={today} />
                  </div>
                  <Textarea name="notes" label="Observação" rows={2} />
                </FormModal>
              )
            }
          />
          {onSite.length === 0 ? (
            <EmptyState title="Sem material na obra" description="Transfira do estoque central em Suprimentos › Estoque." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>Lote</Th>
                  <Th>Validade</Th>
                  <Th align="right">Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {onSite.map((o, i) => (
                  <tr key={i}>
                    <Td>{o.product.name}</Td>
                    <Td className="tabular">{o.batch?.batchNumber ?? "—"}</Td>
                    <Td>
                      {date(o.batch?.expiresAt)}
                      {o.alert && <Badge tone={o.alert === "vencendo" ? "amber" : "red"} className="ml-2">{o.alert}</Badge>}
                    </Td>
                    <Td align="right">
                      {number(o.qty)} {o.product.unit}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Rastreabilidade" description="Qual produto, lote, área, funcionário, data e quantidade (últimos 300 movimentos)." />
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Movimento</Th>
              <Th>Produto</Th>
              <Th>Lote</Th>
              <Th>Área</Th>
              <Th>Funcionário</Th>
              <Th align="right">Quantidade</Th>
              <Th align="right">Custo</Th>
            </tr>
          </thead>
          <tbody>
            {moves.map(({ m, productName, unit, batchNumber, areaName, employeeName }) => (
              <tr key={m.id}>
                <Td className="tabular">{date(m.date)}</Td>
                <Td>{TYPE_LABEL[m.type]}</Td>
                <Td>{productName}</Td>
                <Td className="tabular">{batchNumber ?? "—"}</Td>
                <Td>{areaName ?? "—"}</Td>
                <Td>{employeeName ?? "—"}</Td>
                <Td align="right">
                  {number(m.quantity)} {unit}
                </Td>
                <Td align="right">{money(m.quantity * m.unitCost)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

