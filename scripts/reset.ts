/** Apaga TODOS os dados (somente desenvolvimento). Bloqueado em produção. */
import { Client } from "pg";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DB_RESET !== "yes") {
    throw new Error("Reset bloqueado em produção. Defina ALLOW_DB_RESET=yes se tiver certeza.");
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await client.end();
  console.log("🧹 Banco limpo.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
