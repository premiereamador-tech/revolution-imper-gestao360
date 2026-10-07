import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { savedFilters } from "@/server/db/schema";

export function savedFiltersFor(userId: string, screen: string) {
  return db
    .select({ id: savedFilters.id, name: savedFilters.name, query: savedFilters.query })
    .from(savedFilters)
    .where(and(eq(savedFilters.userId, userId), eq(savedFilters.screen, screen)))
    .orderBy(asc(savedFilters.name));
}
