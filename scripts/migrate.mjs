// Aplica as migrations (pasta ./drizzle) usando apenas dependências de produção.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não configurada");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
await pool.end();
console.log("✅ Migrations aplicadas.");
