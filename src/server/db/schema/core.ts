import {
  bigint,
  boolean,
  integer,
  index,
  inet,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_helpers";

/** Empresa (tenant). Hoje: apenas Revolution Imper. Preparado para filiais/franquias. */
export const companies = pgTable("companies", {
  id: id(),
  name: varchar("name", { length: 160 }).notNull(),
  legalName: varchar("legal_name", { length: 200 }),
  document: varchar("document", { length: 20 }),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 2 }),
  ...timestamps,
});

export const branches = pgTable("branches", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 120 }).notNull(),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 2 }),
  ...timestamps,
});

export const roles = pgTable(
  "roles",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    key: varchar("key", { length: 40 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("roles_company_key_uq").on(t.companyId, t.key)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permission: varchar("permission", { length: 60 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 160 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    active: boolean("active").notNull().default(true),
    /** Vincula usuário a um funcionário (encarregado/aplicador) ou cliente (portal). */
    employeeId: uuid("employee_id"),
    clientId: uuid("client_id"),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    userId: uuid("user_id").references(() => users.id),
    action: varchar("action", { length: 60 }).notNull(),
    entity: varchar("entity", { length: 60 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: inet("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 20 }).notNull().default("in_app"),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    link: varchar("link", { length: 300 }),
    severity: varchar("severity", { length: 12 }).notNull().default("info"),
    readAt: timestamp("read_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

/** Configurações por empresa (ex.: limites de aprovação, pesos do semáforo). */
export const settings = pgTable(
  "settings",
  {
    companyId: uuid("company_id").notNull().references(() => companies.id),
    key: varchar("key", { length: 80 }).notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.key] })],
);

export const savedFilters = pgTable("saved_filters", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  screen: varchar("screen", { length: 60 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  query: text("query").notNull(),
  ...timestamps,
});

/** Metadados de arquivos (o binário fica no storage S3-compatível). */
export const files = pgTable(
  "files",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    storageKey: text("storage_key").notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    kind: varchar("kind", { length: 20 }).notNull(), // photo | video | pdf | sheet | document
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("files_company_idx").on(t.companyId)],
);
