import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";
import { storage } from "@/server/storage";

/** Entrega arquivos apenas para usuários autenticados da mesma empresa. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Não encontrado", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  const [f] = await db.select().from(files).where(and(eq(files.id, id), eq(files.companyId, user.companyId))).limit(1);
  if (!f) return new Response("Não encontrado", { status: 404 });
  try {
    const body = await storage().get(f.storageKey);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": f.mimeType,
        "Content-Disposition": `${f.kind === "photo" || f.kind === "pdf" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.originalName)}`,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch {
    return new Response("Arquivo indisponível no storage", { status: 410 });
  }
}
