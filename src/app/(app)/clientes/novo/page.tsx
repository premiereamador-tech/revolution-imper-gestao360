import type { Metadata } from "next";
import { ClientForm } from "@/components/domain/client-form";
import { PageHeader } from "@/components/ui/primitives";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NovoCliente() {
  await requireUser("clients:edit");
  return (
    <>
      <PageHeader back={{ href: "/clientes", label: "Clientes" }} title="Novo cliente" />
      <ClientForm />
    </>
  );
}
