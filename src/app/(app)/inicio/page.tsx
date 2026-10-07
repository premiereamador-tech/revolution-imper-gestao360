import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";

/** Página inicial por perfil: cada pessoa cai na tela que mais usa. */
export default async function Inicio() {
  const user = await requireUser();
  const p = user.permissions;
  if (user.roleKey === "diretoria" && p.has("owner:view")) redirect("/central-do-dono");
  if (p.has("dashboard:view")) redirect("/");
  if (p.has("field:use") || p.has("timesheet:self")) redirect("/campo");
  if (p.has("finance:view")) redirect("/financeiro");
  if (p.has("stock:view")) redirect("/suprimentos/estoque");
  if (p.has("projects:view")) redirect("/obras");
  if (p.has("portal:view")) redirect("/portal");
  redirect("/sem-permissao");
}
