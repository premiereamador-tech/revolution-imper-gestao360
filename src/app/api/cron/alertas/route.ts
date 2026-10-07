import { and, eq, gte, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { topProblems } from "@/domain/insights";
import { db } from "@/server/db";
import { companies, notifications, roles, users } from "@/server/db/schema";
import { notify } from "@/server/notifications";
import { loadOperationalSnapshot } from "@/server/services/insights";

/**
 * Rotina diária de alertas: gera notificações dos maiores problemas para
 * diretoria e administradores. Agende uma chamada diária (cron do servidor,
 * Vercel Cron, GitHub Actions…) com o cabeçalho Authorization: Bearer CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }
  let sent = 0;
  for (const c of await db.select().from(companies)) {
    const snap = await loadOperationalSnapshot(c.id);
    const problems = topProblems(snap.insights, 5);
    if (!problems.length) continue;
    const recipients = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(users.companyId, c.id), eq(users.active, true), sql`${roles.key} in ('admin','diretoria')`));
    for (const r of recipients) {
      // evita duplicar o resumo no mesmo dia
      const [already] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.userId, r.id), eq(notifications.title, "Resumo diário: pontos de atenção"), gte(notifications.createdAt, new Date(Date.now() - 20 * 3_600_000))))
        .limit(1);
      if (already) continue;
      await notify(
        { companyId: c.id, userId: r.id, email: r.email, title: "Resumo diário: pontos de atenção", body: problems.map((p, i) => `${i + 1}. ${p.title}`).join("\n"), link: "/central-do-dono", severity: problems[0].severity === "critico" ? "critico" : "atencao" },
        ["in_app", "email"],
      );
      sent++;
    }
  }
  return Response.json({ ok: true, sent });
}
