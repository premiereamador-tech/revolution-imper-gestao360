import type { Metadata } from "next";
import { and, asc, eq, lte } from "drizzle-orm";
import { ppeDeliveryAction, trainingAction } from "../actions";
import { Input, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardHeader, EmptyState, Kpi, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { addDays, todayISO } from "@/domain/dates";
import { date } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { employees, employeeTrainings, ppeDeliveries, ppeItems, trainings } from "@/server/db/schema";

export const metadata: Metadata = { title: "Segurança do trabalho" };

export default async function SegurancaPage() {
  const user = await requireUser("employees:view");
  const today = todayISO();
  const [ppe, ppeDue, tr, trDue, emps, items, trs] = await Promise.all([
    db.select().from(ppeItems).where(eq(ppeItems.companyId, user.companyId)).orderBy(asc(ppeItems.name)),
    db
      .select({ d: ppeDeliveries, emp: employees.name, item: ppeItems.name })
      .from(ppeDeliveries)
      .innerJoin(employees, eq(employees.id, ppeDeliveries.employeeId))
      .innerJoin(ppeItems, eq(ppeItems.id, ppeDeliveries.ppeItemId))
      .where(and(eq(employees.companyId, user.companyId), eq(employees.status, "ativo"), lte(ppeDeliveries.nextReplacementAt, addDays(today, 15))))
      .orderBy(asc(ppeDeliveries.nextReplacementAt)),
    db.select().from(trainings).where(eq(trainings.companyId, user.companyId)),
    db
      .select({ t: employeeTrainings, emp: employees.name, name: trainings.name })
      .from(employeeTrainings)
      .innerJoin(employees, eq(employees.id, employeeTrainings.employeeId))
      .innerJoin(trainings, eq(trainings.id, employeeTrainings.trainingId))
      .where(and(eq(employees.companyId, user.companyId), eq(employees.status, "ativo"), lte(employeeTrainings.validUntil, addDays(today, 30))))
      .orderBy(asc(employeeTrainings.validUntil)),
    db.select({ id: employees.id, name: employees.name }).from(employees).where(and(eq(employees.companyId, user.companyId), eq(employees.status, "ativo"))).orderBy(asc(employees.name)),
    db.select({ id: ppeItems.id, name: ppeItems.name, ca: ppeItems.ca }).from(ppeItems).where(eq(ppeItems.companyId, user.companyId)),
    db.select({ id: trainings.id, name: trainings.name }).from(trainings).where(eq(trainings.companyId, user.companyId)),
  ]);
  const editable = can(user, "employees:edit");
  const caExpiring = ppe.filter((p) => p.caValidUntil && p.caValidUntil <= addDays(today, 90));

  return (
    <>
      <PageHeader
        title="Segurança do trabalho"
        description="EPIs, CAs, treinamentos (NRs) e DDS com alertas de vencimento."
        actions={
          editable && (
            <>
              <FormModal trigger="Entregar EPI" title="Registrar entrega de EPI" action={ppeDeliveryAction} variant="secondary">
                <Select name="employeeId" label="Funcionário" required placeholder="Selecione" options={emps.map((e) => ({ value: e.id, label: e.name }))} />
                <Select name="ppeItemId" label="EPI" required placeholder="Selecione" options={items.map((i) => ({ value: i.id, label: `${i.name} (CA ${i.ca ?? "—"})` }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input name="quantity" label="Quantidade" defaultValue="1" inputMode="numeric" />
                  <Input name="deliveredAt" type="date" label="Data" defaultValue={today} required />
                </div>
              </FormModal>
              <FormModal trigger="Registrar treinamento" title="Registrar treinamento / DDS" action={trainingAction}>
                <Select name="employeeId" label="Funcionário" required placeholder="Selecione" options={emps.map((e) => ({ value: e.id, label: e.name }))} />
                <Select name="trainingId" label="Treinamento" required placeholder="Selecione" options={trs.map((t) => ({ value: t.id, label: t.name }))} />
                <Input name="completedAt" type="date" label="Realizado em" defaultValue={today} required />
                <Textarea name="notes" label="Observações" rows={2} />
              </FormModal>
            </>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="EPIs com troca em até 15 dias" value={ppeDue.length} tone={ppeDue.length ? "warning" : "default"} />
        <Kpi label="Treinamentos vencendo em 30 dias" value={trDue.length} tone={trDue.length ? "warning" : "default"} />
        <Kpi label="CAs vencendo em 90 dias" value={caExpiring.length} tone={caExpiring.length ? "warning" : "default"} />
        <Kpi label="Tipos de treinamento" value={tr.length} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="EPIs a trocar" />
          {ppeDue.length === 0 ? (
            <EmptyState title="Nenhuma troca prevista nos próximos 15 dias" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Funcionário</Th>
                  <Th>EPI</Th>
                  <Th>Entregue</Th>
                  <Th>Troca</Th>
                </tr>
              </thead>
              <tbody>
                {ppeDue.map(({ d, emp, item }) => (
                  <tr key={d.id}>
                    <Td>{emp}</Td>
                    <Td>{item}</Td>
                    <Td className="tabular">{date(d.deliveredAt)}</Td>
                    <Td>
                      <Badge tone={d.nextReplacementAt! < today ? "red" : "amber"}>{date(d.nextReplacementAt)}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Treinamentos a renovar" />
          {trDue.length === 0 ? (
            <EmptyState title="Nenhum treinamento vencendo" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Funcionário</Th>
                  <Th>Treinamento</Th>
                  <Th>Validade</Th>
                </tr>
              </thead>
              <tbody>
                {trDue.map(({ t, emp, name }) => (
                  <tr key={t.id}>
                    <Td>{emp}</Td>
                    <Td>{name}</Td>
                    <Td>
                      <Badge tone={t.validUntil! < today ? "red" : "amber"}>{date(t.validUntil)}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Cadastro de EPIs" />
          <Table>
            <thead>
              <tr>
                <Th>EPI</Th>
                <Th>CA</Th>
                <Th>Validade do CA</Th>
                <Th align="right">Troca a cada</Th>
              </tr>
            </thead>
            <tbody>
              {ppe.map((p) => (
                <tr key={p.id}>
                  <Td>{p.name}</Td>
                  <Td className="tabular">{p.ca}</Td>
                  <Td>{p.caValidUntil && p.caValidUntil <= addDays(today, 90) ? <Badge tone="amber">{date(p.caValidUntil)}</Badge> : date(p.caValidUntil)}</Td>
                  <Td align="right">{p.replacementDays ? `${p.replacementDays} dias` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
