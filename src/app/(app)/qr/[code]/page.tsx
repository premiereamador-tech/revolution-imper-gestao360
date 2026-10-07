import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { checkoutAction, returnAction } from "../../patrimonio/actions";
import { Select, Textarea, Input } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardBody, CardHeader, Field, LinkButton, PageHeader } from "@/components/ui/primitives";
import { batchAlert } from "@/domain/stock";
import { addDays, todayISO } from "@/domain/dates";
import { date, number } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { employees, equipment, equipmentMovements, productBatches, products, projects } from "@/server/db/schema";
import { financeOptions } from "@/server/services/options";
import { stockBalances } from "@/server/services/stock";

export const metadata: Metadata = { title: "Leitura de QR" };

/** Destino das etiquetas QR: mostra o item e as ações possíveis (retirar, devolver, consumir). */
export default async function QrPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireUser();
  const code = decodeURIComponent((await params).code);
  const today = todayISO();

  if (code.startsWith("P:")) {
    const tag = code.slice(2);
    const [row] = await db
      .select({ e: equipment, project: projects.name, holder: employees.name })
      .from(equipment)
      .leftJoin(projects, eq(projects.id, equipment.currentProjectId))
      .leftJoin(employees, eq(employees.id, equipment.currentHolderId))
      .where(and(eq(equipment.companyId, user.companyId), eq(equipment.assetTag, tag)))
      .limit(1);
    if (!row) notFound();
    const history = await db.select().from(equipmentMovements).where(eq(equipmentMovements.equipmentId, row.e.id)).orderBy(desc(equipmentMovements.createdAt)).limit(5);
    const opts = can(user, "equipment:edit") ? await financeOptions(user.companyId) : null;
    return (
      <>
        <PageHeader title={`${row.e.assetTag} ${row.e.name}`} description="Patrimônio" />
        <Card className="max-w-xl">
          <CardBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Situação">
                <Badge tone={row.e.status === "em_uso" ? "blue" : row.e.status === "disponivel" ? "green" : "amber"}>{row.e.status.replace("_", " ")}</Badge>
              </Field>
              <Field label="Com quem">{row.holder ?? "Estoque central"}</Field>
              <Field label="Obra">{row.project ?? "—"}</Field>
              <Field label="Devolução prevista">{date(row.e.expectedReturnAt)}</Field>
            </dl>
            {opts && row.e.status === "disponivel" && (
              <FormModal trigger="Retirar este item" title="Retirada" action={checkoutAction} size="lg">
                <input type="hidden" name="id" value={row.e.id} />
                <Select name="employeeId" label="Com quem" required placeholder="Selecione" options={opts.employees} />
                <Select name="projectId" label="Obra" placeholder="Sem obra" options={opts.projects} />
                <Input name="expectedReturnAt" type="date" label="Devolução prevista" defaultValue={addDays(today, 15)} />
              </FormModal>
            )}
            {opts && row.e.status === "em_uso" && (
              <FormModal trigger="Registrar devolução" title="Devolução" action={returnAction} size="lg">
                <input type="hidden" name="id" value={row.e.id} />
                <Textarea name="notes" label="Estado do item" rows={2} />
              </FormModal>
            )}
            <ul className="border-t border-border pt-3 text-[13px] text-muted">
              {history.map((h) => (
                <li key={h.id}>
                  {date(h.date)}: {h.type}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </>
    );
  }

  if (code.startsWith("L:")) {
    const id = code.slice(2);
    if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
    const [row] = await db.select({ b: productBatches, p: products }).from(productBatches).innerJoin(products, eq(products.id, productBatches.productId)).where(and(eq(productBatches.id, id), eq(products.companyId, user.companyId))).limit(1);
    if (!row) notFound();
    const balances = (await stockBalances(user.companyId)).filter((b) => b.batchId === id && b.qty > 0);
    const al = batchAlert(row.b, today);
    return (
      <>
        <PageHeader title={row.p.name} description={`Lote ${row.b.batchNumber}`} />
        <Card className="max-w-xl">
          <CardHeader title="Lote" actions={al && <Badge tone={al === "vencendo" ? "amber" : "red"}>{al}</Badge>} />
          <CardBody className="space-y-3">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Fabricante">{row.p.manufacturer}</Field>
              <Field label="Validade">{date(row.b.expiresAt)}</Field>
              <Field label="Fabricação">{date(row.b.manufacturedAt)}</Field>
              <Field label="Ficha técnica">{row.p.hasTechnicalSheet ? "Cadastrada" : "Pendente"}</Field>
            </dl>
            <p className="text-sm font-medium">Saldo por estoque</p>
            <ul className="text-sm">
              {balances.map((b) => (
                <li key={b.warehouseId}>
                  {number(b.qty)} {row.p.unit}
                </li>
              ))}
            </ul>
            {can(user, "field:use") && <LinkButton href="/campo?acao=material">Lançar consumo no campo</LinkButton>}
          </CardBody>
        </Card>
      </>
    );
  }
  notFound();
}
