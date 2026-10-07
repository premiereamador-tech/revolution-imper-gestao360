import {
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id, money, qty, timestamps } from "./_helpers";
import { companies, users } from "./core";
import { projects } from "./projects";

export const contractTypeEnum = pgEnum("employment_type", ["clt", "diarista", "pj", "autonomo", "estagio"]);
export const employeeStatusEnum = pgEnum("employee_status", ["ativo", "afastado", "ferias", "desligado"]);

export const employees = pgTable(
  "employees",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: varchar("name", { length: 160 }).notNull(),
    photoUrl: text("photo_url"),
    cpf: varchar("cpf", { length: 14 }),
    rg: varchar("rg", { length: 20 }),
    phone: varchar("phone", { length: 20 }),
    address: varchar("address", { length: 300 }),
    jobTitle: varchar("job_title", { length: 80 }).notNull(),
    role: varchar("role", { length: 80 }),
    admissionDate: date("admission_date"),
    salary: money("salary"),
    employmentType: contractTypeEnum("employment_type").notNull().default("clt"),
    dailyRate: money("daily_rate"),
    hourlyRate: money("hourly_rate").notNull().default(0),
    pixKey: varchar("pix_key", { length: 120 }),
    bankName: varchar("bank_name", { length: 80 }),
    emergencyContact: varchar("emergency_contact", { length: 200 }),
    status: employeeStatusEnum("status").notNull().default("ativo"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("employees_cpf_uq").on(t.companyId, t.cpf)],
);

export const teams = pgTable("teams", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 80 }).notNull(),
  foremanId: uuid("foreman_id").references(() => employees.id),
  color: varchar("color", { length: 20 }),
  ...timestamps,
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    roleInTeam: varchar("role_in_team", { length: 40 }).notNull().default("aplicador"),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.employeeId] })],
);

export const timeEntryTypeEnum = pgEnum("time_entry_type", [
  "trabalho",
  "falta",
  "atestado",
  "folga",
  "ferias",
]);

/** Um registro por funcionário por dia. Horas calculadas no backend. */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id),
    date: date("date").notNull(),
    type: timeEntryTypeEnum("type").notNull().default("trabalho"),
    clockIn: timestamp("clock_in", { withTimezone: true }),
    breakStart: timestamp("break_start", { withTimezone: true }),
    breakEnd: timestamp("break_end", { withTimezone: true }),
    clockOut: timestamp("clock_out", { withTimezone: true }),
    workedHours: qty("worked_hours").notNull().default(0),
    overtimeHours: qty("overtime_hours").notNull().default(0),
    executedArea: qty("executed_area").notNull().default(0),
    latitude: varchar("latitude", { length: 20 }),
    longitude: varchar("longitude", { length: 20 }),
    photoFileId: uuid("photo_file_id"),
    clientUuid: uuid("client_uuid"),
    notes: varchar("notes", { length: 300 }),
    /** Custo apurado (horas × valor/hora) lançado no razão de custos da obra. */
    laborCost: money("labor_cost").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("time_entries_emp_date_uq").on(t.employeeId, t.date),
    index("time_entries_project_idx").on(t.projectId, t.date),
    uniqueIndex("time_entries_client_uuid_uq").on(t.clientUuid),
  ],
);

export const ppeItems = pgTable("ppe_items", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 120 }).notNull(),
  ca: varchar("ca", { length: 20 }),
  caValidUntil: date("ca_valid_until"),
  replacementDays: qty("replacement_days"),
});

export const ppeDeliveries = pgTable("ppe_deliveries", {
  id: id(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  ppeItemId: uuid("ppe_item_id").notNull().references(() => ppeItems.id),
  quantity: qty("quantity").notNull().default(1),
  deliveredAt: date("delivered_at").notNull(),
  nextReplacementAt: date("next_replacement_at"),
  signatureFileId: uuid("signature_file_id"),
  deliveredById: uuid("delivered_by_id").references(() => users.id),
});

export const trainings = pgTable("trainings", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 160 }).notNull(),
  kind: varchar("kind", { length: 20 }).notNull().default("treinamento"), // treinamento | nr | dds
  validityMonths: qty("validity_months"),
});

export const employeeTrainings = pgTable("employee_trainings", {
  id: id(),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  trainingId: uuid("training_id").notNull().references(() => trainings.id),
  completedAt: date("completed_at").notNull(),
  validUntil: date("valid_until"),
  certificateFileId: uuid("certificate_file_id"),
  notes: text("notes"),
});
