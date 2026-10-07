import {
  boolean,
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
import { clients, contracts } from "./commercial";
import { companies, files, users } from "./core";
import { employees } from "./people";
import { costCategoryEnum, projectAreas, projects } from "./projects";
import { suppliers } from "./supply";

export const bankAccounts = pgTable("bank_accounts", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 120 }).notNull(),
  bank: varchar("bank", { length: 80 }),
  agency: varchar("agency", { length: 10 }),
  accountNumber: varchar("account_number", { length: 20 }),
  pixKey: varchar("pix_key", { length: 120 }),
  openingBalance: money("opening_balance").notNull().default(0),
  openingDate: date("opening_date").notNull(),
  active: boolean("active").notNull().default(true),
});

export const costCenters = pgTable(
  "cost_centers",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    kind: varchar("kind", { length: 20 }).notNull(), // obra | administrativo | comercial
    projectId: uuid("project_id").references(() => projects.id),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("cost_centers_code_uq").on(t.companyId, t.code)],
);

/** Plano de contas gerencial — alimenta a DRE. */
export const dreGroupEnum = pgEnum("dre_group", [
  "receita",
  "deducao",
  "custo_direto",
  "despesa_administrativa",
  "despesa_financeira",
  "receita_financeira",
]);

export const financialCategories = pgTable("financial_categories", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 120 }).notNull(),
  type: varchar("type", { length: 10 }).notNull(), // receita | despesa
  dreGroup: dreGroupEnum("dre_group").notNull(),
  /** Quando a despesa é custo de obra, em qual categoria de custo ela entra. */
  costCategory: costCategoryEnum("cost_category"),
});

export const measurementStatusEnum = pgEnum("measurement_status", [
  "prevista",
  "executada",
  "aprovada",
  "faturada",
  "recebida",
]);

export const measurements = pgTable(
  "measurements",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: measurementStatusEnum("status").notNull().default("executada"),
    grossValue: money("gross_value").notNull().default(0),
    retentionRate: pct("retention_rate").notNull().default(0),
    retentionValue: money("retention_value").notNull().default(0),
    netValue: money("net_value").notNull().default(0),
    dueDate: date("due_date"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedById: uuid("approved_by_id").references(() => users.id),
    invoicedAt: timestamp("invoiced_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("measurements_project_number_uq").on(t.projectId, t.number)],
);

export const measurementItems = pgTable("measurement_items", {
  id: id(),
  measurementId: uuid("measurement_id").notNull().references(() => measurements.id, { onDelete: "cascade" }),
  areaId: uuid("area_id").references(() => projectAreas.id),
  service: varchar("service", { length: 200 }).notNull(),
  unit: varchar("unit", { length: 10 }).notNull().default("m²"),
  contractedQuantity: qty("contracted_quantity").notNull(),
  previousQuantity: qty("previous_quantity").notNull().default(0),
  currentQuantity: qty("current_quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  value: money("value").notNull(),
});

export const invoices = pgTable("invoices", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  number: varchar("number", { length: 30 }),
  kind: varchar("kind", { length: 10 }).notNull().default("nfse"), // nfse | nfe | recibo
  clientId: uuid("client_id").references(() => clients.id),
  projectId: uuid("project_id").references(() => projects.id),
  measurementId: uuid("measurement_id").references(() => measurements.id),
  issueDate: date("issue_date").notNull(),
  value: money("value").notNull(),
  /** Retorno do provedor fiscal (integração futura). */
  providerPayload: jsonb("provider_payload"),
  fileId: uuid("file_id").references(() => files.id),
  ...timestamps,
});

export const paymentMethodEnum = pgEnum("payment_method", [
  "pix",
  "boleto",
  "transferencia",
  "cartao",
  "dinheiro",
  "cheque",
]);

export const receivableStatusEnum = pgEnum("receivable_status", [
  "previsto",
  "a_vencer",
  "vencido",
  "parcial",
  "recebido",
  "cancelado",
]);

export const accountsReceivable = pgTable(
  "accounts_receivable",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    projectId: uuid("project_id").references(() => projects.id),
    contractId: uuid("contract_id").references(() => contracts.id),
    measurementId: uuid("measurement_id").references(() => measurements.id),
    categoryId: uuid("category_id").references(() => financialCategories.id),
    description: varchar("description", { length: 200 }).notNull(),
    installment: integer("installment"),
    installmentsTotal: integer("installments_total"),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    discount: money("discount").notNull().default(0),
    interest: money("interest").notNull().default(0),
    receivedAmount: money("received_amount").notNull().default(0),
    receivedAt: date("received_at"),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id),
    method: paymentMethodEnum("method"),
    /** Previsto = ainda não confirmado (ex.: parcela de medição futura). */
    forecast: boolean("forecast").notNull().default(false),
    cancelled: boolean("cancelled").notNull().default(false),
    /** Integração futura com boleto/PIX dinâmico. */
    externalChargeId: varchar("external_charge_id", { length: 120 }),
    ...timestamps,
  },
  (t) => [
    index("ar_due_idx").on(t.companyId, t.dueDate),
    index("ar_project_idx").on(t.projectId),
    uniqueIndex("ar_measurement_uq").on(t.measurementId),
  ],
);

export const accountsPayable = pgTable(
  "accounts_payable",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    employeeId: uuid("employee_id").references(() => employees.id),
    projectId: uuid("project_id").references(() => projects.id),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id),
    categoryId: uuid("category_id").notNull().references(() => financialCategories.id),
    purchaseOrderId: uuid("purchase_order_id"),
    description: varchar("description", { length: 200 }).notNull(),
    documentNumber: varchar("document_number", { length: 40 }),
    competenceDate: date("competence_date").notNull(),
    dueDate: date("due_date").notNull(),
    amount: money("amount").notNull(),
    paidAmount: money("paid_amount").notNull().default(0),
    paidAt: date("paid_at"),
    bankAccountId: uuid("bank_account_id").references(() => bankAccounts.id),
    method: paymentMethodEnum("method"),
    receiptFileId: uuid("receipt_file_id").references(() => files.id),
    approvalStatus: varchar("approval_status", { length: 20 }).notNull().default("aprovado"),
    cancelled: boolean("cancelled").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("ap_due_idx").on(t.companyId, t.dueDate), index("ap_project_idx").on(t.projectId)],
);

/** Movimento financeiro efetivo (caixa). Baixas de AR/AP geram registros aqui. */
export const cashTransactions = pgTable(
  "cash_transactions",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    bankAccountId: uuid("bank_account_id").notNull().references(() => bankAccounts.id),
    direction: varchar("direction", { length: 3 }).notNull(), // in | out
    amount: money("amount").notNull(),
    date: date("date").notNull(),
    description: varchar("description", { length: 200 }).notNull(),
    receivableId: uuid("receivable_id").references(() => accountsReceivable.id),
    payableId: uuid("payable_id").references(() => accountsPayable.id),
    method: paymentMethodEnum("method"),
    reconciled: boolean("reconciled").notNull().default(false),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cash_tx_date_idx").on(t.companyId, t.date)],
);

export const approvalStatusEnum = pgEnum("approval_status", ["pendente", "aprovado", "reprovado"]);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    kind: varchar("kind", { length: 30 }).notNull(), // compra | despesa | desconto | aditivo | medicao | pagamento
    entityId: uuid("entity_id").notNull(),
    amount: money("amount").notNull(),
    description: varchar("description", { length: 300 }).notNull(),
    requiredRole: varchar("required_role", { length: 40 }).notNull(),
    status: approvalStatusEnum("status").notNull().default("pendente"),
    requestedById: uuid("requested_by_id").references(() => users.id),
    decidedById: uuid("decided_by_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    comment: varchar("comment", { length: 300 }),
    ...timestamps,
  },
  (t) => [index("approvals_status_idx").on(t.companyId, t.status)],
);
