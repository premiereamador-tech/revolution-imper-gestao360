import type { Metadata } from "next";
import { createProjectAction } from "../actions";
import { ActionForm, Input, MoneyInput, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Card, CardBody, CardHeader, LinkButton, PageHeader } from "@/components/ui/primitives";
import { UFS } from "@/domain/br";
import { COST_CATEGORIES, COST_CATEGORY_LABEL } from "@/domain/project-finance";
import { todayISO } from "@/domain/dates";
import { requireUser } from "@/server/auth/session";
import { projectFormOptions } from "@/server/services/projects";
import { CepAutofill } from "@/components/domain/cep-autofill";

export const metadata: Metadata = { title: "Nova obra" };

export default async function NovaObra() {
  const user = await requireUser("projects:edit");
  const o = await projectFormOptions(user.companyId);
  return (
    <>
      <PageHeader back={{ href: "/obras", label: "Obras" }} title="Nova obra" description="Obras vindas de orçamento aprovado são criadas automaticamente. Use este cadastro para obras contratadas fora do fluxo comercial." />
      {o.clientList.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm">Cadastre o cliente antes de criar a obra.</p>
            <LinkButton href="/clientes/novo" className="mt-3">
              Cadastrar cliente
            </LinkButton>
          </CardBody>
        </Card>
      ) : (
        <ActionForm action={createProjectAction} className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader title="Identificação" />
              <CardBody className="grid gap-4 md:grid-cols-2">
                <Input name="name" label="Nome da obra" required wrapClassName="md:col-span-2" />
                <Select name="clientId" label="Cliente" required placeholder="Selecione" options={o.clientList.map((c) => ({ value: c.id, label: c.name }))} />
                <Select name="statusKey" label="Status inicial" defaultValue="contratada" options={o.statusList.map((s) => ({ value: s.key, label: s.label }))} />
                <Select name="engineerId" label="Engenheiro responsável" placeholder="Selecione" options={o.engineers.map((e) => ({ value: e.id, label: e.name }))} />
                <Select name="foremanEmployeeId" label="Encarregado" placeholder="Selecione" options={o.foremen.map((e) => ({ value: e.id, label: e.name }))} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Local" />
              <CardBody className="grid gap-4 md:grid-cols-4">
                <CepAutofill />
                <Input name="address" label="Endereço" wrapClassName="md:col-span-3" />
                <Input name="city" label="Cidade" wrapClassName="md:col-span-2" />
                <Select name="state" label="UF" defaultValue="SP" options={UFS.map((u) => ({ value: u, label: u }))} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Contato no cliente" />
              <CardBody className="grid gap-4 md:grid-cols-3">
                <Input name="clientContactName" label="Responsável" />
                <Input name="clientContactPhone" label="WhatsApp" inputMode="tel" />
                <Input name="clientContactEmail" label="E-mail" type="email" />
              </CardBody>
            </Card>
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Contrato e prazo" />
              <CardBody className="grid gap-4 md:grid-cols-2">
                <MoneyInput name="contractValue" label="Valor do contrato" required />
                <Input name="contractedArea" label="Área contratada (m²)" inputMode="decimal" required />
                <Input name="plannedStart" type="date" label="Início previsto" defaultValue={todayISO()} />
                <Input name="contractDays" type="number" min={1} label="Prazo (dias)" />
                <Input name="dailyTargetArea" inputMode="decimal" label="Meta diária (m²/dia)" />
                <Input name="retentionRate" inputMode="decimal" label="Retenção contratual (%)" defaultValue="0" />
                <Input name="warrantyMonths" type="number" min={0} label="Garantia (meses)" defaultValue="60" />
                <Input name="paymentMethod" label="Forma de pagamento" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Orçamento de custos" description="Base do previsto × realizado e do alerta de estouro." />
              <CardBody className="grid grid-cols-2 gap-4">
                {COST_CATEGORIES.map((c) => (
                  <MoneyInput key={c} name={`budget_${c}`} label={COST_CATEGORY_LABEL[c]} />
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <Textarea name="notes" label="Observações" />
                <SubmitButton className="mt-4 w-full" size="lg">
                  Criar obra
                </SubmitButton>
                <p className="mt-2 text-[12px] text-muted">Ao criar, o sistema abre o centro de custo e o estoque da obra.</p>
              </CardBody>
            </Card>
          </div>
        </ActionForm>
      )}
    </>
  );
}
