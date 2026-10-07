import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { id, money, qty, timestamps } from "./_helpers";
import { companies, users } from "./core";
import { employees } from "./people";
import { projectAreas, projects } from "./projects";

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    legalName: varchar("legal_name", { length: 200 }).notNull(),
    tradeName: varchar("trade_name", { length: 200 }),
    cnpj: varchar("cnpj", { length: 18 }),
    contactName: varchar("contact_name", { length: 120 }),
    phone: varchar("phone", { length: 20 }),
    whatsapp: varchar("whatsapp", { length: 20 }),
    email: varchar("email", { length: 160 }),
    productsSupplied: text("products_supplied"),
    commercialTerms: text("commercial_terms"),
    paymentTermDays: integer("payment_term_days"),
    /** Avaliação 1-5 (média ponderada de prazo, qualidade e preço). */
    rating: qty("rating"),
    ...timestamps,
  },
  (t) => [uniqueIndex("suppliers_cnpj_uq").on(t.companyId, t.cnpj)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    sku: varchar("sku", { length: 40 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    manufacturer: varchar("manufacturer", { length: 120 }),
    category: varchar("category", { length: 80 }).notNull(),
    unit: varchar("unit", { length: 10 }).notNull(),
    averageCost: money("average_cost").notNull().default(0),
    minStock: qty("min_stock").notNull().default(0),
    hasTechnicalSheet: boolean("has_technical_sheet").notNull().default(false),
    technicalSheetFileId: uuid("technical_sheet_file_id"),
    safetySheetFileId: uuid("safety_sheet_file_id"),
    systemId: uuid("system_id"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("products_sku_uq").on(t.companyId, t.sku)],
);

export const productBatches = pgTable(
  "product_batches",
  {
    id: id(),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    batchNumber: varchar("batch_number", { length: 60 }).notNull(),
    manufacturedAt: date("manufactured_at"),
    expiresAt: date("expires_at"),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    blocked: boolean("blocked").notNull().default(false),
    blockReason: varchar("block_reason", { length: 200 }),
    ...timestamps,
  },
  (t) => [uniqueIndex("batches_product_number_uq").on(t.productId, t.batchNumber)],
);

export const warehouseTypeEnum = pgEnum("warehouse_type", ["central", "obra", "veiculo"]);

export const warehouses = pgTable("warehouses", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  name: varchar("name", { length: 120 }).notNull(),
  type: warehouseTypeEnum("type").notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  vehiclePlate: varchar("vehicle_plate", { length: 10 }),
  active: boolean("active").notNull().default(true),
});

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "entrada",
  "saida",
  "transferencia",
  "devolucao",
  "perda",
  "consumo",
  "ajuste",
]);

/**
 * Livro de movimentações de estoque (imutável). Saldo = Σ entradas − Σ saídas por depósito/lote.
 * Consumo exige obra e gera custo no razão da obra.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    type: stockMovementTypeEnum("type").notNull(),
    productId: uuid("product_id").notNull().references(() => products.id),
    batchId: uuid("batch_id").references(() => productBatches.id),
    fromWarehouseId: uuid("from_warehouse_id").references(() => warehouses.id),
    toWarehouseId: uuid("to_warehouse_id").references(() => warehouses.id),
    quantity: qty("quantity").notNull(),
    unitCost: money("unit_cost").notNull().default(0),
    projectId: uuid("project_id").references(() => projects.id),
    areaId: uuid("area_id").references(() => projectAreas.id),
    employeeId: uuid("employee_id").references(() => employees.id),
    purchaseOrderId: uuid("purchase_order_id"),
    date: date("date").notNull(),
    notes: varchar("notes", { length: 300 }),
    clientUuid: uuid("client_uuid"),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_mov_product_idx").on(t.productId),
    index("stock_mov_project_idx").on(t.projectId),
    uniqueIndex("stock_mov_client_uuid_uq").on(t.clientUuid),
  ],
);

export const purchaseStatusEnum = pgEnum("purchase_status", [
  "solicitado",
  "em_cotacao",
  "aguardando_aprovacao",
  "aprovado",
  "pedido_emitido",
  "entregue_parcial",
  "entregue",
  "cancelado",
]);

export const purchaseRequests = pgTable("purchase_requests", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  number: integer("number").notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  requestedById: uuid("requested_by_id").references(() => users.id),
  neededBy: date("needed_by"),
  status: purchaseStatusEnum("status").notNull().default("solicitado"),
  notes: text("notes"),
  ...timestamps,
});

export const purchaseRequestItems = pgTable("purchase_request_items", {
  id: id(),
  requestId: uuid("request_id").notNull().references(() => purchaseRequests.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  quantity: qty("quantity").notNull(),
});

export const purchaseQuotes = pgTable("purchase_quotes", {
  id: id(),
  requestId: uuid("request_id").notNull().references(() => purchaseRequests.id, { onDelete: "cascade" }),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  unitPrice: money("unit_price").notNull(),
  deliveryDays: integer("delivery_days"),
  paymentTermDays: integer("payment_term_days"),
  selected: boolean("selected").notNull().default(false),
  ...timestamps,
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  number: integer("number").notNull(),
  requestId: uuid("request_id").references(() => purchaseRequests.id),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  projectId: uuid("project_id").references(() => projects.id),
  warehouseId: uuid("warehouse_id").references(() => warehouses.id),
  status: purchaseStatusEnum("status").notNull().default("pedido_emitido"),
  total: money("total").notNull().default(0),
  expectedDelivery: date("expected_delivery"),
  deliveredAt: date("delivered_at"),
  approvedById: uuid("approved_by_id").references(() => users.id),
  ...timestamps,
});

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: id(),
  orderId: uuid("order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id),
  quantity: qty("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  receivedQuantity: qty("received_quantity").notNull().default(0),
});

export const equipmentStatusEnum = pgEnum("equipment_status", [
  "disponivel",
  "em_uso",
  "manutencao",
  "baixado",
]);

export const equipment = pgTable(
  "equipment",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    assetTag: varchar("asset_tag", { length: 30 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    category: varchar("category", { length: 60 }).notNull(), // equipamento | ferramenta | epi_coletivo
    brand: varchar("brand", { length: 80 }),
    status: equipmentStatusEnum("status").notNull().default("disponivel"),
    currentProjectId: uuid("current_project_id").references(() => projects.id),
    currentHolderId: uuid("current_holder_id").references(() => employees.id),
    currentWarehouseId: uuid("current_warehouse_id").references(() => warehouses.id),
    checkedOutAt: date("checked_out_at"),
    expectedReturnAt: date("expected_return_at"),
    nextMaintenanceAt: date("next_maintenance_at"),
    acquisitionValue: money("acquisition_value"),
    ...timestamps,
  },
  (t) => [uniqueIndex("equipment_tag_uq").on(t.companyId, t.assetTag)],
);

export const equipmentMovements = pgTable("equipment_movements", {
  id: id(),
  equipmentId: uuid("equipment_id").notNull().references(() => equipment.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // retirada | devolucao | transferencia
  projectId: uuid("project_id").references(() => projects.id),
  employeeId: uuid("employee_id").references(() => employees.id),
  date: date("date").notNull(),
  expectedReturnAt: date("expected_return_at"),
  notes: varchar("notes", { length: 300 }),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const equipmentMaintenance = pgTable("equipment_maintenance", {
  id: id(),
  equipmentId: uuid("equipment_id").notNull().references(() => equipment.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 20 }).notNull(), // preventiva | corretiva
  date: date("date").notNull(),
  cost: money("cost").notNull().default(0),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  description: text("description"),
  nextReviewAt: date("next_review_at"),
  ...timestamps,
});
