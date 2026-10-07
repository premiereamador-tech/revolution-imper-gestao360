import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id, money, timestamps } from "./_helpers";
import { companies, files, users } from "./core";
import { teams } from "./people";
import { projectAreas, projects, waterproofingSystems } from "./projects";

/**
 * Referências técnicas (normas, fichas de fabricante, procedimentos internos).
 * Guardamos apenas código/título/versão e o documento da empresa — nunca o texto da norma.
 */
export const technicalReferences = pgTable("technical_references", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  kind: varchar("kind", { length: 30 }).notNull(), // norma | fabricante | procedimento_interno
  code: varchar("code", { length: 60 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  version: varchar("version", { length: 40 }),
  fileId: uuid("file_id").references(() => files.id),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const checklistTemplates = pgTable("checklist_templates", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 160 }).notNull(),
  stage: varchar("stage", { length: 80 }),
  systemId: uuid("system_id").references(() => waterproofingSystems.id),
  referenceId: uuid("reference_id").references(() => technicalReferences.id),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const checklistTemplateItems = pgTable("checklist_template_items", {
  id: id(),
  templateId: uuid("template_id").notNull().references(() => checklistTemplates.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  question: varchar("question", { length: 300 }).notNull(),
  required: boolean("required").notNull().default(true),
  photoRequired: boolean("photo_required").notNull().default(false),
});

export const checklistStatusEnum = pgEnum("checklist_status", ["aberto", "aprovado", "reprovado"]);

export const checklists = pgTable(
  "checklists",
  {
    id: id(),
    templateId: uuid("template_id").notNull().references(() => checklistTemplates.id),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    areaId: uuid("area_id").references(() => projectAreas.id),
    status: checklistStatusEnum("status").notNull().default("aberto"),
    clientUuid: uuid("client_uuid"),
    filledById: uuid("filled_by_id").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("checklists_project_idx").on(t.projectId)],
);

export const checklistAnswers = pgTable("checklist_answers", {
  id: id(),
  checklistId: uuid("checklist_id").notNull().references(() => checklists.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => checklistTemplateItems.id),
  answer: varchar("answer", { length: 10 }).notNull(), // sim | nao | na
  photoFileId: uuid("photo_file_id"),
  notes: varchar("notes", { length: 300 }),
});

export const inspections = pgTable("inspections", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  areaId: uuid("area_id").references(() => projectAreas.id),
  date: date("date").notNull(),
  inspectorId: uuid("inspector_id").references(() => users.id),
  result: varchar("result", { length: 20 }).notNull(), // aprovada | com_ressalvas | reprovada
  notes: text("notes"),
  ...timestamps,
});

export const ncSeverityEnum = pgEnum("nc_severity", ["baixa", "media", "alta", "critica"]);
export const ncStatusEnum = pgEnum("nc_status", ["aberta", "em_tratamento", "resolvida", "cancelada"]);

export const nonconformities = pgTable(
  "nonconformities",
  {
    id: id(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    areaId: uuid("area_id").references(() => projectAreas.id),
    systemId: uuid("system_id").references(() => waterproofingSystems.id),
    teamId: uuid("team_id").references(() => teams.id),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    severity: ncSeverityEnum("severity").notNull().default("media"),
    cause: varchar("cause", { length: 120 }),
    correctiveAction: text("corrective_action"),
    responsibleId: uuid("responsible_id").references(() => users.id),
    detectedAt: date("detected_at").notNull(),
    dueDate: date("due_date"),
    resolvedAt: date("resolved_at"),
    status: ncStatusEnum("status").notNull().default("aberta"),
    isRework: boolean("is_rework").notNull().default(false),
    estimatedReworkCost: money("estimated_rework_cost").notNull().default(0),
    source: varchar("source", { length: 30 }).notNull().default("manual"), // manual | teste_estanqueidade | inspecao | pos_venda
    sourceId: uuid("source_id"),
    clientUuid: uuid("client_uuid"),
    ...timestamps,
  },
  (t) => [index("nc_project_status_idx").on(t.projectId, t.status)],
);

export const tightnessTests = pgTable("tightness_tests", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  areaId: uuid("area_id").references(() => projectAreas.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  responsibleId: uuid("responsible_id").references(() => users.id),
  initialCondition: text("initial_condition"),
  result: text("result"),
  approved: boolean("approved"),
  notes: text("notes"),
  signatureFileId: uuid("signature_file_id"),
  ...timestamps,
});
