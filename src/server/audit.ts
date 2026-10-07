import { auditLogs } from "@/server/db/schema";
import type { DB, Tx } from "@/server/db";

export interface AuditActor {
  id: string | null;
  companyId: string;
  ip?: string | null;
}

/**
 * Trilha de auditoria (§64). Grava antes/depois para operações sensíveis.
 * Recebe a transação para que o log só exista se a operação for confirmada.
 */
export async function audit(
  tx: DB | Tx,
  actor: AuditActor,
  action: string,
  entity: string,
  entityId: string | null,
  before?: unknown,
  after?: unknown,
) {
  await tx.insert(auditLogs).values({
    companyId: actor.companyId,
    userId: actor.id,
    action,
    entity,
    entityId,
    before: before === undefined ? null : sanitize(before),
    after: after === undefined ? null : sanitize(after),
    ip: actor.ip && /^[\d.:a-fA-F]+$/.test(actor.ip) ? actor.ip : null,
  });
}

const SECRET_KEYS = /password|token|secret|hash/i;

function sanitize(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(sanitize);
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, SECRET_KEYS.test(k) ? "[omitido]" : sanitize(val)]),
  );
}
