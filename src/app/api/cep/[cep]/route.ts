import { getCurrentUser } from "@/server/auth/session";
import { lookupCep } from "@/server/integrations/br";

export async function GET(_req: Request, ctx: { params: Promise<{ cep: string }> }) {
  if (!(await getCurrentUser())) return new Response("Não autenticado", { status: 401 });
  const { cep } = await ctx.params;
  const r = await lookupCep(cep);
  return r ? Response.json(r) : Response.json({ error: "CEP não encontrado" }, { status: 404 });
}
