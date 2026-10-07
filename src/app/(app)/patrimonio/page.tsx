import type { Metadata } from "next";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { checkoutAction, maintenanceAction, returnAction, saveEquipmentAction } from "./actions";
import { Checkbox, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/ui/form-modal";
import { Badge, Card, CardHeader, Kpi, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { addDays, todayISO } from "@/domain/dates";
import { date, money } from "@/lib/format";
import { can, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { employees, equipment, equipmentMaintenance, projects, suppliers } from "@/server/db/schema";
import { financeOptions } from "@/server/services/options";

export const metadata: Metadata = { title: "Patrimônio" };
const STATUS: Record<string, { label: string; tone: string }> = { disponivel: { label: "Disponível", tone: "green" }, em_uso: { label: "Em uso", tone: "blue" }, manutencao: { label: "Manutenção", tone: "amber" }, baixado: { label: "Baixado", tone: "slate" } };
const CAT: Record<string, string> = { equipamento: "Equipamento", ferramenta: "Ferramenta", epi_coletivo: "EPI coletivo" };

export default async function PatrimonioPage() {
  const user = await requireUser("equipment:edit");
  const today = todayISO();
  const [rows, opts] = await Promise.all([
    db
      .select({ e: equipment, project: projects.code, holder: employees.name })
      .from(equipment)
      .leftJoin(projects, eq(projects.id, equipment.currentProjectId))
      .leftJoin(employees, eq(employees.id, equipment.currentHolderId))
      .where(eq(equipment.companyId, user.companyId))
      .orderBy(asc(equipment.assetTag)),
    financeOptions(user.companyId),
  ]);
  const maint = rows.length
    ? await db
        .select({ m: equipmentMaintenance, tag: equipment.assetTag, name: equipment.name, supplier: suppliers.tradeName })
        .from(equipmentMaintenance)
        .innerJoin(equipment, eq(equipment.id, equipmentMaintenance.equipmentId))
        .leftJoin(suppliers, eq(suppliers.id, equipmentMaintenance.supplierId))
        .where(inArray(equipmentMaintenance.equipmentId, rows.map((r) => r.e.id)))
        .orderBy(desc(equipmentMaintenance.date))
        .limit(30)
    : [];
  const overdue = rows.filter((r) => r.e.status === "em_uso" && r.e.expectedReturnAt && r.e.expectedReturnAt < today);
  const maintDue = rows.filter((r) => r.e.nextMaintenanceAt && r.e.nextMaintenanceAt <= addDays(today, 15));
  const edit = can(user, "equipment:edit");

  return (
    <>
      <PageHeader
        title="Patrimônio"
        description="Equipamentos, ferramentas e EPIs coletivos: onde estão, com quem, em qual obra e quando voltam. Cada item tem código para etiqueta QR."
        actions={
          edit && (
            <>
            <LinkButton href="/impressao/etiquetas?tipo=patrimonio" variant="secondary" target="_blank" prefetch={false}>
              Etiquetas QR
            </LinkButton>
            <FormModal trigger="Novo item" title="Cadastrar item de patrimônio" action={saveEquipmentAction}>
              <div className="grid grid-cols-2 gap-3">
                <Input name="assetTag" label="Patrimônio (código)" required placeholder="PAT-011" />
                <Select name="category" label="Tipo" options={Object.entries(CAT).map(([v, l]) => ({ value: v, label: l }))} />
                <Input name="name" label="Descrição" required wrapClassName="col-span-2" />
                <Input name="brand" label="Marca" />
                <MoneyInput name="acquisitionValue" label="Valor de aquisição" />
                <Input name="nextMaintenanceAt" type="date" label="Próxima revisão" />
              </div>
            </FormModal>
            </>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Itens" value={rows.length} />
        <Kpi label="Em uso" value={rows.filter((r) => r.e.status === "em_uso").length} />
        <Kpi label="Devolução atrasada" value={overdue.length} tone={overdue.length ? "negative" : "default"} />
        <Kpi label="Revisão em até 15 dias" value={maintDue.length} tone={maintDue.length ? "warning" : "default"} />
      </div>
      <Card className="mb-6">
        <Table>
          <thead>
            <tr>
              <Th>Patrimônio</Th>
              <Th>Item</Th>
              <Th>Situação</Th>
              <Th>Onde / com quem</Th>
              <Th>Devolução prevista</Th>
              <Th>Próxima revisão</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, project, holder }) => (
              <tr key={e.id}>
                <Td className="font-medium tabular">{e.assetTag}</Td>
                <Td>
                  {e.name}
                  <p className="text-[12px] text-muted">
                    {CAT[e.category] ?? e.category}
                    {e.brand ? `, ${e.brand}` : ""}
                    {e.acquisitionValue ? `, ${money(e.acquisitionValue)}` : ""}
                  </p>
                </Td>
                <Td>
                  <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>
                </Td>
                <Td className="text-[13px]">{e.status === "em_uso" ? `${project ?? "sem obra"}, com ${holder ?? "—"}` : "Estoque central"}</Td>
                <Td className={e.expectedReturnAt && e.expectedReturnAt < today && e.status === "em_uso" ? "font-medium text-danger" : ""}>{date(e.expectedReturnAt)}</Td>
                <Td className={e.nextMaintenanceAt && e.nextMaintenanceAt <= addDays(today, 15) ? "text-[#8a5800]" : ""}>{date(e.nextMaintenanceAt)}</Td>
                <Td className="whitespace-nowrap">
                  {edit && e.status === "disponivel" && (
                    <FormModal trigger="Retirar" title={`Retirada: ${e.assetTag} ${e.name}`} action={checkoutAction} variant="secondary" size="sm">
                      <input type="hidden" name="id" value={e.id} />
                      <Select name="employeeId" label="Com quem" required placeholder="Selecione" options={opts.employees} />
                      <Select name="projectId" label="Para qual obra" placeholder="Sem obra" options={opts.projects} />
                      <Input name="expectedReturnAt" type="date" label="Devolução prevista" defaultValue={addDays(today, 15)} />
                      <Textarea name="notes" label="Observação" rows={2} />
                    </FormModal>
                  )}
                  {edit && e.status === "em_uso" && (
                    <FormModal trigger="Devolver" title={`Devolução: ${e.assetTag} ${e.name}`} action={returnAction} variant="secondary" size="sm">
                      <input type="hidden" name="id" value={e.id} />
                      <Textarea name="notes" label="Estado do item" rows={2} />
                      <Checkbox name="needsMaintenance" label="Enviar para manutenção" />
                    </FormModal>
                  )}
                  {edit && (
                    <FormModal trigger="Manutenção" title={`Manutenção: ${e.assetTag}`} action={maintenanceAction} variant="ghost" size="sm">
                      <input type="hidden" name="id" value={e.id} />
                      <div className="grid grid-cols-2 gap-3">
                        <Select name="kind" label="Tipo" options={[{ value: "preventiva", label: "Preventiva" }, { value: "corretiva", label: "Corretiva" }]} />
                        <Input name="date" type="date" label="Data" defaultValue={today} required />
                        <MoneyInput name="cost" label="Custo" required />
                        <Select name="supplierId" label="Fornecedor" placeholder="—" options={opts.suppliers} />
                        <Input name="nextReviewAt" type="date" label="Próxima revisão" />
                      </div>
                      <Textarea name="description" label="Serviço executado" rows={2} />
                    </FormModal>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title="Histórico de manutenções" />
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Item</Th>
              <Th>Tipo</Th>
              <Th>Serviço</Th>
              <Th>Fornecedor</Th>
              <Th align="right">Custo</Th>
            </tr>
          </thead>
          <tbody>
            {maint.map(({ m, tag, name, supplier }) => (
              <tr key={m.id}>
                <Td className="tabular">{date(m.date)}</Td>
                <Td>
                  {tag} {name}
                </Td>
                <Td className="capitalize">{m.kind}</Td>
                <Td>{m.description}</Td>
                <Td>{supplier ?? "—"}</Td>
                <Td align="right">{money(m.cost)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
