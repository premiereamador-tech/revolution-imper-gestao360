import type { Metadata } from "next";
import { EmployeeForm } from "@/components/domain/employee-form";
import { PageHeader } from "@/components/ui/primitives";
import { can, requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Novo funcionário" };

export default async function NovoFuncionario() {
  const user = await requireUser("employees:edit");
  return (
    <>
      <PageHeader back={{ href: "/equipe/funcionarios", label: "Funcionários" }} title="Novo funcionário" />
      <EmployeeForm sensitive={can(user, "employees:sensitive")} />
    </>
  );
}
