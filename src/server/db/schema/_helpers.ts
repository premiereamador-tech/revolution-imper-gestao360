import { numeric, timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Valores monetários em BRL com 2 casas decimais. */
export const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });

/** Quantidades (m², litros, kg, unidades) com 3 casas decimais. */
export const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });

/** Percentuais (0-100) com 2 casas. */
export const pct = (name: string) => numeric(name, { precision: 6, scale: 2, mode: "number" });
