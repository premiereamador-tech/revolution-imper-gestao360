import { date, index, integer, pgEnum, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { id, money, timestamps } from "./_helpers";
import { clients } from "./commercial";
import { companies, users } from "./core";
import { projectAreas, projects, waterproofingSystems } from "./projects";

export const warranties = pgTable(
  "warranties",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    areaId: uuid("area_id").references(() => projectAreas.id),
    systemId: uuid("system_id").references(() => waterproofingSystems.id),
    service: varchar("service", { length: 200 }).notNull(),
    deliveredAt: date("delivered_at").notNull(),
    months: integer("months").notNull(),
    startsAt: date("starts_at").notNull(),
    endsAt: date("ends_at").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("warranties_ends_idx").on(t.endsAt)],
);

export const serviceRequestKindEnum = pgEnum("service_request_kind", ["garantia", "manutencao", "novo_servico"]);
export const serviceRequestStatusEnum = pgEnum("service_request_status", [
  "aberta",
  "visita_agendada",
  "em_atendimento",
  "resolvida",
  "improcedente",
]);

export const serviceRequests = pgTable("service_requests", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  projectId: uuid("project_id").references(() => projects.id),
  warrantyId: uuid("warranty_id").references(() => warranties.id),
  kind: serviceRequestKindEnum("kind").notNull(),
  problem: text("problem").notNull(),
  openedAt: date("opened_at").notNull(),
  visitAt: date("visit_at"),
  solution: text("solution"),
  cost: money("cost").notNull().default(0),
  status: serviceRequestStatusEnum("status").notNull().default("aberta"),
  responsibleId: uuid("responsible_id").references(() => users.id),
  ...timestamps,
});

export const deliveryTerms = pgTable("delivery_terms", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  deliveredAt: date("delivered_at").notNull(),
  companySignerName: varchar("company_signer_name", { length: 120 }),
  clientSignerName: varchar("client_signer_name", { length: 120 }),
  companySignatureFileId: uuid("company_signature_file_id"),
  clientSignatureFileId: uuid("client_signature_file_id"),
  notes: text("notes"),
  signed: varchar("signed", { length: 5 }).notNull().default("nao"),
  ...timestamps,
});
