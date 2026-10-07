import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getConnectionString } from "@netlify/database";
import { env } from "@/server/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

/**
 * Conexão: DATABASE_URL quando definida (Docker/VPS/dev); na Netlify, o banco
 * provisionado pela plataforma (Netlify Database) é resolvido automaticamente.
 */
function connectionString(): string | undefined {
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (process.env.NETLIFY_DB_URL) return process.env.NETLIFY_DB_URL;
  if (process.env.NETLIFY || process.env.SITE_ID) {
    try {
      return getConnectionString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: connectionString(),
    max: env.DATABASE_POOL_MAX,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
