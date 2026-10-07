import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id, money, pct, qty, timestamps } from "./_helpers";
import { companies, users } from "./core";

export const personTypeEnum = pgEnum("person_type", ["PF", "PJ"]);

export const clients = pgTable(
  "clients",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    personType: personTypeEnum("person_type").notNull().default("PF"),
    name: varchar("name", { length: 200 }).notNull(),
    tradeName: varchar("trade_name", { length: 200 }),
    document: varchar("document", { length: 18 }),
    email: varchar("email", { length: 160 }),
    phone: varchar("phone", { length: 20 }),
    whatsapp: varchar("whatsapp", { length: 20 }),
    contactName: varchar("contact_name", { length: 120 }),
    zipCode: varchar("zip_code", { length: 9 }),
    street: varchar("street", { length: 200 }),
    number: varchar("number", { length: 20 }),
    complement: varchar("complement", { length: 100 }),
    district: varchar("district", { length: 120 }),
    city: varchar("city", { length: 120 }),
    state: varchar("state", { length: 2 }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("clients_company_name_idx").on(t.companyId, t.name),
    uniqueIndex("clients_company_document_uq").on(t.companyId, t.document),
  ],
);

export const leadStageEnum = pgEnum("lead_stage", [
  "lead",
  "contato",
  "visita_agendada",
  "visita_realizada",
  "orcamento",
  "proposta_enviada",
  "negociacao",
  "fechado",
  "perdido",
]);

export const leadSourceEnum = pgEnum("lead_source", [
  "google",
  "instagram",
  "facebook",
  "indicacao",
  "cliente_antigo",
  "whatsapp",
  "site",
  "parceiro",
  "outros",
]);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    clientId: uuid("client_id").references(() => clients.id),
    name: varchar("name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 160 }),
    city: varchar("city", { length: 120 }),
    source: leadSourceEnum("source").notNull().default("outros"),
    stage: leadStageEnum("stage").notNull().default("lead"),
    estimatedValue: money("estimated_value"),
    sellerId: uuid("seller_id").references(() => users.id),
    lostReason: varchar("lost_reason", { length: 200 }),
    description: text("description"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("leads_stage_idx").on(t.companyId, t.stage)],
);

export const technicalVisits = pgTable("technical_visits", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  leadId: uuid("lead_id").references(() => leads.id),
  clientId: uuid("client_id").references(() => clients.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  doneAt: timestamp("done_at", { withTimezone: true }),
  address: varchar("address", { length: 300 }),
  latitude: varchar("latitude", { length: 20 }),
  longitude: varchar("longitude", { length: 20 }),
  reportedProblem: text("reported_problem"),
  infiltrationType: varchar("infiltration_type", { length: 120 }),
  approxArea: qty("approx_area"),
  probableCauses: text("probable_causes"),
  proposedSolution: text("proposed_solution"),
  suggestedMaterials: text("suggested_materials"),
  notes: text("notes"),
  responsibleId: uuid("responsible_id").references(() => users.id),
  ...timestamps,
});

export const quoteStatusEnum = pgEnum("quote_status", [
  "rascunho",
  "enviado",
  "aprovado",
  "reprovado",
  "expirado",
]);

export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    number: integer("number").notNull(),
    version: integer("version").notNull().default(1),
    parentQuoteId: uuid("parent_quote_id"),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    leadId: uuid("lead_id").references(() => leads.id),
    visitId: uuid("visit_id").references(() => technicalVisits.id),
    title: varchar("title", { length: 200 }).notNull(),
    siteAddress: varchar("site_address", { length: 300 }),
    siteCity: varchar("site_city", { length: 120 }),
    siteState: varchar("site_state", { length: 2 }),
    status: quoteStatusEnum("status").notNull().default("rascunho"),
    validUntil: date("valid_until"),
    discount: money("discount").notNull().default(0),
    taxRate: pct("tax_rate").notNull().default(0),
    paymentTerms: text("payment_terms"),
    executionDays: integer("execution_days"),
    warrantyMonths: integer("warranty_months"),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("quotes_number_version_uq").on(t.companyId, t.number, t.version)],
);

export const quoteItems = pgTable("quote_items", {
  id: id(),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  service: varchar("service", { length: 200 }).notNull(),
  description: text("description"),
  unit: varchar("unit", { length: 10 }).notNull().default("m²"),
  quantity: qty("quantity").notNull(),
  materialUnitCost: money("material_unit_cost").notNull().default(0),
  laborUnitCost: money("labor_unit_cost").notNull().default(0),
  unitPrice: money("unit_price").notNull(),
  systemId: uuid("system_id"),
});

export const contractStatusEnum = pgEnum("contract_status", [
  "rascunho",
  "aguardando_assinatura",
  "assinado",
  "encerrado",
  "cancelado",
]);

export const contracts = pgTable(
  "contracts",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    number: varchar("number", { length: 30 }).notNull(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    quoteId: uuid("quote_id").references(() => quotes.id),
    status: contractStatusEnum("status").notNull().default("aguardando_assinatura"),
    value: money("value").notNull(),
    signedAt: date("signed_at"),
    startDate: date("start_date"),
    durationDays: integer("duration_days"),
    paymentTerms: text("payment_terms"),
    downPayment: money("down_payment").notNull().default(0),
    installments: integer("installments").notNull().default(1),
    retentionRate: pct("retention_rate").notNull().default(0),
    warrantyMonths: integer("warranty_months"),
    /** Integração futura com assinatura digital (provedor + id externo). */
    signatureProvider: varchar("signature_provider", { length: 40 }),
    signatureExternalId: varchar("signature_external_id", { length: 120 }),
    terms: text("terms"),
    ...timestamps,
  },
  (t) => [uniqueIndex("contracts_number_uq").on(t.companyId, t.number)],
);

export const contractAdditionStatusEnum = pgEnum("contract_addition_status", [
  "pendente",
  "aprovado",
  "reprovado",
]);

export const contractAdditions = pgTable("contract_additions", {
  id: id(),
  contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  description: text("description").notNull(),
  quantity: qty("quantity"),
  unit: varchar("unit", { length: 10 }),
  value: money("value").notNull(),
  extraDays: integer("extra_days").notNull().default(0),
  status: contractAdditionStatusEnum("status").notNull().default("pendente"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  items: jsonb("items"),
  ...timestamps,
});
