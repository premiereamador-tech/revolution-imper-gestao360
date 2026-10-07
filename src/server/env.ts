import { z } from "zod";

/**
 * Variáveis de ambiente validadas. Segredos nunca ficam no código —
 * veja `.env.example`. Valores ausentes só falham quando realmente usados,
 * para permitir `next build` sem banco disponível.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default(""),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  APP_URL: z.string().default("http://localhost:3000"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  NOTIFY_EMAIL_DRIVER: z.enum(["mock", "smtp"]).default("mock"),
  NOTIFY_WHATSAPP_DRIVER: z.enum(["mock", "meta"]).default("mock"),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_ID: z.string().optional(),
  SMTP_URL: z.string().optional(),
  CEP_PROVIDER: z.enum(["mock", "viacep"]).default("viacep"),
});

export const env = schema.parse(process.env);

export function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada. Copie .env.example para .env e ajuste.");
  }
  return env.DATABASE_URL;
}
