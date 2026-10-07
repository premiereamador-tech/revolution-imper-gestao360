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

/** Categoria fixa usada pelas regras de negócio; rótulo e cor são configuráveis. */
export const statusCategoryEnum = pgEnum("status_category", [
  "pre_obra",
  "ativa",
  "pausada",
  "concluida",
  "garantia",
  "cancelada",
]);

export const projectStatuses = pgTable(
  "project_statuses",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    key: varchar("key", { length: 40 }).notNull(),
    label: varchar("label", { length: 60 }).notNull(),
    color: varchar("color", { length: 20 }).notNull().default("slate"),
    category: statusCategoryEnum("category").notNull(),
    position: integer("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("project_status_key_uq").on(t.companyId, t.key)],
);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    contractId: uuid("contract_id").references(() => contracts.id),
    statusId: uuid("status_id").notNull().references(() => projectStatuses.id),
    zipCode: varchar("zip_code", { length: 9 }),
    address: varchar("address", { length: 300 }),
    city: varchar("city", { length: 120 }),
    state: varchar("state", { length: 2 }),
    latitude: varchar("latitude", { length: 20 }),
    longitude: varchar("longitude", { length: 20 }),
    clientContactName: varchar("client_contact_name", { length: 120 }),
    clientContactPhone: varchar("client_contact_phone", { length: 20 }),
    clientContactEmail: varchar("client_contact_email", { length: 160 }),
    engineerId: uuid("engineer_id").references(() => users.id),
    supervisorId: uuid("supervisor_id").references(() => users.id),
    foremanEmployeeId: uuid("foreman_employee_id"),
    contractSignedAt: date("contract_signed_at"),
    plannedStart: date("planned_start"),
    actualStart: date("actual_start"),
    contractDays: integer("contract_days"),
    plannedEnd: date("planned_end"),
    actualEnd: date("actual_end"),
    contractValue: money("contract_value").notNull().default(0),
    paymentMethod: varchar("payment_method", { length: 120 }),
    retentionRate: pct("retention_rate").notNull().default(0),
    /** Área total contratada (m²) — base para avanço físico e produtividade. */
    contractedArea: qty("contracted_area").notNull().default(0),
    /** Meta diária padrão da obra (m²/dia) — usada na home do encarregado. */
    dailyTargetArea: qty("daily_target_area"),
    warrantyMonths: integer("warranty_months"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("projects_code_uq").on(t.companyId, t.code),
    index("projects_status_idx").on(t.statusId),
    index("projects_client_idx").on(t.clientId),
  ],
);

export const costCategoryEnum = pgEnum("cost_category", [
  "materiais",
  "mao_de_obra",
  "terceiros",
  "equipamentos",
  "transporte",
  "impostos",
  "outros",
]);

/** Orçamento de custo (previsto) por categoria. */
export const projectBudgets = pgTable(
  "project_budgets",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    category: costCategoryEnum("category").notNull(),
    amount: money("amount").notNull().default(0),
  },
  (t) => [uniqueIndex("project_budget_cat_uq").on(t.projectId, t.category)],
);

/**
 * Livro-razão de custos incorridos da obra. Toda automação que gera custo
 * (consumo de material, apontamento de horas, conta a pagar vinculada) grava aqui.
 */
export const projectCostEntries = pgTable(
  "project_cost_entries",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    category: costCategoryEnum("category").notNull(),
    amount: money("amount").notNull(),
    date: date("date").notNull(),
    description: varchar("description", { length: 300 }).notNull(),
    source: varchar("source", { length: 30 }).notNull(), // stock | payable | timesheet | manual
    sourceId: uuid("source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cost_entries_project_idx").on(t.projectId, t.category),
    uniqueIndex("cost_entries_source_uq").on(t.source, t.sourceId),
  ],
);

export const projectPhases = pgTable("project_phases", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  position: integer("position").notNull().default(0),
  /** Peso financeiro da etapa (%), usado na Curva S. */
  weight: pct("weight").notNull().default(0),
});

export const projectTasks = pgTable(
  "project_tasks",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    phaseId: uuid("phase_id").references(() => projectPhases.id, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    responsibleId: uuid("responsible_id").references(() => users.id),
    plannedStart: date("planned_start").notNull(),
    plannedEnd: date("planned_end").notNull(),
    actualStart: date("actual_start"),
    actualEnd: date("actual_end"),
    progress: pct("progress").notNull().default(0),
    dependsOnTaskId: uuid("depends_on_task_id"),
    plannedArea: qty("planned_area"),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("tasks_project_idx").on(t.projectId)],
);

export const applicationTypes = pgTable("application_types", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 80 }).notNull(),
});

export const waterproofingSystems = pgTable("waterproofing_systems", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 120 }).notNull(),
  family: varchar("family", { length: 60 }).notNull(), // manta, membrana, cimenticio...
  description: text("description"),
  defaultCoats: integer("default_coats"),
  defaultConsumptionPerM2: qty("default_consumption_per_m2"),
  consumptionUnit: varchar("consumption_unit", { length: 10 }),
  minCureHours: integer("min_cure_hours"),
  active: boolean("active").notNull().default(true),
});

/** Ficha técnica de cada área impermeabilizada. */
export const projectAreas = pgTable(
  "project_areas",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    applicationTypeId: uuid("application_type_id").references(() => applicationTypes.id),
    environmentType: varchar("environment_type", { length: 80 }),
    structureType: varchar("structure_type", { length: 80 }),
    location: varchar("location", { length: 160 }),
    contractedArea: qty("contracted_area").notNull().default(0),
    measuredArea: qty("measured_area"),
    executedArea: qty("executed_area").notNull().default(0),
    substrate: varchar("substrate", { length: 80 }),
    substrateCondition: varchar("substrate_condition", { length: 80 }),
    moisture: varchar("moisture", { length: 40 }),
    hasCracks: boolean("has_cracks").notNull().default(false),
    hasFissures: boolean("has_fissures").notNull().default(false),
    needsLeveling: boolean("needs_leveling").notNull().default(false),
    slopeOk: boolean("slope_ok"),
    drains: integer("drains").notNull().default(0),
    pipes: integer("pipes").notNull().default(0),
    joints: varchar("joints", { length: 160 }),
    baseboards: varchar("baseboards", { length: 160 }),
    finishing: varchar("finishing", { length: 160 }),
    criticalPoints: text("critical_points"),
    ...timestamps,
  },
  (t) => [index("areas_project_idx").on(t.projectId)],
);

export const waterproofingApplications = pgTable("waterproofing_applications", {
  id: id(),
  areaId: uuid("area_id").notNull().references(() => projectAreas.id, { onDelete: "cascade" }),
  systemId: uuid("system_id").notNull().references(() => waterproofingSystems.id),
  manufacturer: varchar("manufacturer", { length: 120 }),
  productId: uuid("product_id"),
  plannedQuantity: qty("planned_quantity"),
  usedQuantity: qty("used_quantity"),
  plannedConsumptionPerM2: qty("planned_consumption_per_m2"),
  primer: varchar("primer", { length: 120 }),
  coats: integer("coats"),
  plannedThicknessMm: qty("planned_thickness_mm"),
  executedThicknessMm: qty("executed_thickness_mm"),
  intervalBetweenCoatsHours: integer("interval_between_coats_hours"),
  cureHours: integer("cure_hours"),
  method: varchar("method", { length: 120 }),
  teamId: uuid("team_id"),
  technicalResponsibleId: uuid("technical_responsible_id").references(() => users.id),
  startedAt: date("started_at"),
  finishedAt: date("finished_at"),
  ...timestamps,
});

export const projectTeamAssignments = pgTable("project_team_assignments", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
});

export const dailyLogs = pgTable(
  "daily_logs",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** Id gerado no cliente — garante idempotência na sincronização offline. */
    clientUuid: uuid("client_uuid"),
    weather: varchar("weather", { length: 40 }),
    workersPresent: integer("workers_present").notNull().default(0),
    hoursWorked: qty("hours_worked").notNull().default(0),
    executedArea: qty("executed_area").notNull().default(0),
    areaId: uuid("area_id").references(() => projectAreas.id),
    activities: text("activities"),
    interferences: text("interferences"),
    delays: text("delays"),
    visits: text("visits"),
    occurrences: text("occurrences"),
    notes: text("notes"),
    equipmentUsed: text("equipment_used"),
    presentEmployeeIds: jsonb("present_employee_ids").$type<string[]>(),
    signedById: uuid("signed_by_id").references(() => users.id),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("daily_logs_project_date_idx").on(t.projectId, t.date),
    uniqueIndex("daily_logs_client_uuid_uq").on(t.clientUuid),
  ],
);

export const photoStageEnum = pgEnum("photo_stage", [
  "antes",
  "durante",
  "depois",
  "nao_conformidade",
  "correcao",
  "entrega",
]);

export const projectPhotos = pgTable(
  "project_photos",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").references(() => files.id),
    /** URL externa/placeholder quando não há arquivo no storage. */
    url: text("url"),
    areaId: uuid("area_id").references(() => projectAreas.id, { onDelete: "set null" }),
    dailyLogId: uuid("daily_log_id").references(() => dailyLogs.id, { onDelete: "set null" }),
    nonconformityId: uuid("nonconformity_id"),
    stage: photoStageEnum("stage").notNull().default("durante"),
    caption: varchar("caption", { length: 200 }),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    createdById: uuid("created_by_id").references(() => users.id),
  },
  (t) => [index("photos_project_idx").on(t.projectId, t.stage)],
);

export const documentFolderEnum = pgEnum("document_folder", [
  "contrato",
  "projetos",
  "orcamentos",
  "medicoes",
  "notas_fiscais",
  "comprovantes",
  "fotos",
  "relatorios",
  "fichas_tecnicas",
  "documentos_tecnicos",
  "seguranca",
  "entrega",
  "garantia",
]);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id),
    employeeId: uuid("employee_id"),
    folder: documentFolderEnum("folder").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    fileId: uuid("file_id").references(() => files.id),
    validUntil: date("valid_until"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("documents_project_idx").on(t.projectId, t.folder)],
);
