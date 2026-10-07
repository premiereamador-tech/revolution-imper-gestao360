"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/server/action-helpers";
import { getCurrentUser, AuthError } from "@/server/auth/session";
import { db } from "@/server/db";
import { savedFilters } from "@/server/db/schema";

const schema = z.object({
  screen: z.string().min(1).max(60).regex(/^\/[\w\-/]*$/),
  name: z.string().trim().min(1, "Dê um nome ao filtro").max(80),
  query: z.string().max(1000),
});

export async function saveFilterAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw new AuthError("Sessão expirada.");
    const data = schema.parse({ screen: fd.get("screen"), name: fd.get("name"), query: fd.get("query") ?? "" });
    await db.insert(savedFilters).values({ userId: user.id, ...data });
    revalidatePath(data.screen);
    return { ok: true, message: "Filtro salvo." };
  });
}

export async function deleteFilterAction(id: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await db.delete(savedFilters).where(and(eq(savedFilters.id, id), eq(savedFilters.userId, user.id)));
}
