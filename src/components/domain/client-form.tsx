import { saveClientAction } from "@/app/(app)/clientes/actions";
import { ActionForm, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { formatCEP, formatDocument, formatPhone, UFS } from "@/domain/br";
import type { clients } from "@/server/db/schema";
import { CepAutofill } from "./cep-autofill";

type Client = typeof clients.$inferSelect;

export function ClientForm({ client }: { client?: Client }) {
  return (
    <ActionForm action={saveClientAction} className="grid gap-6 xl:grid-cols-2">
      {client && <input type="hidden" name="id" value={client.id} />}
      <Card>
        <CardHeader title="Dados do cliente" />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Select name="personType" label="Tipo" defaultValue={client?.personType ?? "PJ"} options={[{ value: "PJ", label: "Pessoa jurídica" }, { value: "PF", label: "Pessoa física" }]} />
          <Input name="document" label="CPF/CNPJ" defaultValue={formatDocument(client?.document)} inputMode="numeric" />
          <Input name="name" label="Nome / razão social" defaultValue={client?.name} required wrapClassName="md:col-span-2" />
          <Input name="tradeName" label="Nome fantasia" defaultValue={client?.tradeName ?? ""} />
          <Input name="contactName" label="Responsável" defaultValue={client?.contactName ?? ""} />
          <Input name="phone" label="Telefone" inputMode="tel" defaultValue={formatPhone(client?.phone)} />
          <Input name="whatsapp" label="WhatsApp" inputMode="tel" defaultValue={formatPhone(client?.whatsapp)} />
          <Input name="email" label="E-mail" type="email" defaultValue={client?.email ?? ""} wrapClassName="md:col-span-2" />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Endereço" />
        <CardBody className="grid gap-4 md:grid-cols-4">
          <CepAutofill defaultValue={formatCEP(client?.zipCode)} />
          <Input name="street" label="Logradouro" defaultValue={client?.street ?? ""} wrapClassName="md:col-span-3" />
          <Input name="number" label="Número" defaultValue={client?.number ?? ""} />
          <Input name="complement" label="Complemento" defaultValue={client?.complement ?? ""} />
          <Input name="district" label="Bairro" defaultValue={client?.district ?? ""} wrapClassName="md:col-span-2" />
          <Input name="city" label="Cidade" defaultValue={client?.city ?? ""} wrapClassName="md:col-span-3" />
          <Select name="state" label="UF" defaultValue={client?.state ?? "SP"} options={UFS.map((u) => ({ value: u, label: u }))} />
          <Textarea name="notes" label="Observações" defaultValue={client?.notes ?? ""} wrapClassName="md:col-span-4" />
          <div className="md:col-span-4">
            <SubmitButton>{client ? "Salvar alterações" : "Cadastrar cliente"}</SubmitButton>
          </div>
        </CardBody>
      </Card>
    </ActionForm>
  );
}
