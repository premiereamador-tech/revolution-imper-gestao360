import { saveEmployeeAction } from "@/app/(app)/equipe/actions";
import { ActionForm, Input, MoneyInput, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { formatCPF, formatPhone } from "@/domain/br";
import type { employees } from "@/server/db/schema";

type Employee = typeof employees.$inferSelect;
const br = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export function EmployeeForm({ employee, sensitive }: { employee?: Employee; sensitive: boolean }) {
  return (
    <ActionForm action={saveEmployeeAction} className="grid gap-6 xl:grid-cols-2">
      {employee && <input type="hidden" name="id" value={employee.id} />}
      <Card>
        <CardHeader title="Dados pessoais" />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Input name="name" label="Nome completo" defaultValue={employee?.name} required wrapClassName="md:col-span-2" />
          <Input name="cpf" label="CPF" defaultValue={employee?.cpf ? formatCPF(employee.cpf) : ""} inputMode="numeric" />
          <Input name="rg" label="RG" defaultValue={employee?.rg ?? ""} />
          <Input name="phone" label="Telefone" defaultValue={formatPhone(employee?.phone)} inputMode="tel" />
          <Input name="emergencyContact" label="Contato de emergência" defaultValue={employee?.emergencyContact ?? ""} />
          <Input name="address" label="Endereço" defaultValue={employee?.address ?? ""} wrapClassName="md:col-span-2" />
          <Textarea name="notes" label="Observações" defaultValue={employee?.notes ?? ""} wrapClassName="md:col-span-2" />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Contrato de trabalho" description={sensitive ? undefined : "Salário e dados bancários visíveis apenas para quem tem permissão."} />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Select name="jobTitle" label="Cargo" defaultValue={employee?.jobTitle ?? "Aplicador"} options={["Encarregado", "Aplicador", "Ajudante", "Supervisor", "Motorista", "Administrativo"].map((v) => ({ value: v, label: v }))} />
          <Input name="role" label="Função" defaultValue={employee?.role ?? ""} />
          <Select name="employmentType" label="Contratação" defaultValue={employee?.employmentType ?? "clt"} options={[{ value: "clt", label: "CLT" }, { value: "diarista", label: "Diarista" }, { value: "pj", label: "PJ" }, { value: "autonomo", label: "Autônomo" }, { value: "estagio", label: "Estágio" }]} />
          <Input name="admissionDate" type="date" label="Admissão" defaultValue={employee?.admissionDate ?? ""} />
          <Select name="status" label="Situação" defaultValue={employee?.status ?? "ativo"} options={[{ value: "ativo", label: "Ativo" }, { value: "afastado", label: "Afastado" }, { value: "ferias", label: "Férias" }, { value: "desligado", label: "Desligado" }]} />
          {sensitive && (
            <>
              <MoneyInput name="salary" label="Salário" defaultValue={br(employee?.salary)} />
              <MoneyInput name="hourlyRate" label="Valor da hora (custo)" defaultValue={br(employee?.hourlyRate)} hint="Usado para custear a obra pelo ponto." />
              <MoneyInput name="dailyRate" label="Valor da diária" defaultValue={br(employee?.dailyRate)} />
              <Input name="pixKey" label="Chave PIX" defaultValue={employee?.pixKey ?? ""} />
              <Input name="bankName" label="Banco" defaultValue={employee?.bankName ?? ""} />
            </>
          )}
          <div className="md:col-span-2">
            <SubmitButton>{employee ? "Salvar alterações" : "Cadastrar funcionário"}</SubmitButton>
          </div>
        </CardBody>
      </Card>
    </ActionForm>
  );
}
