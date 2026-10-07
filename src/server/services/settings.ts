import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { settings } from "@/server/db/schema";

export async function getSetting<T>(companyId: string, key: string, fallback: T): Promise<T> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(and(eq(settings.companyId, companyId), eq(settings.key, key)))
    .limit(1);
  return (row?.value as T) ?? fallback;
}

export async function setSetting(companyId: string, key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ companyId, key, value })
    .onConflictDoUpdate({ target: [settings.companyId, settings.key], set: { value, updatedAt: new Date() } });
}
