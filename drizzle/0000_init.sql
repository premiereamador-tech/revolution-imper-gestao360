CREATE TYPE "public"."contract_addition_status" AS ENUM('pendente', 'aprovado', 'reprovado');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('rascunho', 'aguardando_assinatura', 'assinado', 'encerrado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('google', 'instagram', 'facebook', 'indicacao', 'cliente_antigo', 'whatsapp', 'site', 'parceiro', 'outros');--> statement-breakpoint
CREATE TYPE "public"."lead_stage" AS ENUM('lead', 'contato', 'visita_agendada', 'visita_realizada', 'orcamento', 'proposta_enviada', 'negociacao', 'fechado', 'perdido');--> statement-breakpoint
CREATE TYPE "public"."person_type" AS ENUM('PF', 'PJ');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('rascunho', 'enviado', 'aprovado', 'reprovado', 'expirado');--> statement-breakpoint
CREATE TYPE "public"."cost_category" AS ENUM('materiais', 'mao_de_obra', 'terceiros', 'equipamentos', 'transporte', 'impostos', 'outros');--> statement-breakpoint
CREATE TYPE "public"."document_folder" AS ENUM('contrato', 'projetos', 'orcamentos', 'medicoes', 'notas_fiscais', 'comprovantes', 'fotos', 'relatorios', 'fichas_tecnicas', 'documentos_tecnicos', 'seguranca', 'entrega', 'garantia');--> statement-breakpoint
CREATE TYPE "public"."photo_stage" AS ENUM('antes', 'durante', 'depois', 'nao_conformidade', 'correcao', 'entrega');--> statement-breakpoint
CREATE TYPE "public"."status_category" AS ENUM('pre_obra', 'ativa', 'pausada', 'concluida', 'garantia', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('clt', 'diarista', 'pj', 'autonomo', 'estagio');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('ativo', 'afastado', 'ferias', 'desligado');--> statement-breakpoint
CREATE TYPE "public"."time_entry_type" AS ENUM('trabalho', 'falta', 'atestado', 'folga', 'ferias');--> statement-breakpoint
CREATE TYPE "public"."equipment_status" AS ENUM('disponivel', 'em_uso', 'manutencao', 'baixado');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('solicitado', 'em_cotacao', 'aguardando_aprovacao', 'aprovado', 'pedido_emitido', 'entregue_parcial', 'entregue', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('entrada', 'saida', 'transferencia', 'devolucao', 'perda', 'consumo', 'ajuste');--> statement-breakpoint
CREATE TYPE "public"."warehouse_type" AS ENUM('central', 'obra', 'veiculo');--> statement-breakpoint
CREATE TYPE "public"."checklist_status" AS ENUM('aberto', 'aprovado', 'reprovado');--> statement-breakpoint
CREATE TYPE "public"."nc_severity" AS ENUM('baixa', 'media', 'alta', 'critica');--> statement-breakpoint
CREATE TYPE "public"."nc_status" AS ENUM('aberta', 'em_tratamento', 'resolvida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pendente', 'aprovado', 'reprovado');--> statement-breakpoint
CREATE TYPE "public"."dre_group" AS ENUM('receita', 'deducao', 'custo_direto', 'despesa_administrativa', 'despesa_financeira', 'receita_financeira');--> statement-breakpoint
CREATE TYPE "public"."measurement_status" AS ENUM('prevista', 'executada', 'aprovada', 'faturada', 'recebida');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'boleto', 'transferencia', 'cartao', 'dinheiro', 'cheque');--> statement-breakpoint
CREATE TYPE "public"."receivable_status" AS ENUM('previsto', 'a_vencer', 'vencido', 'parcial', 'recebido', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."service_request_kind" AS ENUM('garantia', 'manutencao', 'novo_servico');--> statement-breakpoint
CREATE TYPE "public"."service_request_status" AS ENUM('aberta', 'visita_agendada', 'em_atendimento', 'resolvida', 'improcedente');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(60) NOT NULL,
	"entity" varchar(60) NOT NULL,
	"entity_id" varchar(64),
	"before" jsonb,
	"after" jsonb,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"city" varchar(120),
	"state" varchar(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"legal_name" varchar(200),
	"document" varchar(20),
	"city" varchar(120),
	"state" varchar(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"kind" varchar(20) NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"channel" varchar(20) DEFAULT 'in_app' NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"link" varchar(300),
	"severity" varchar(12) DEFAULT 'info' NOT NULL,
	"read_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" varchar(60) NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"screen" varchar(60) NOT NULL,
	"name" varchar(80) NOT NULL,
	"query" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"company_id" uuid NOT NULL,
	"key" varchar(80) NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_company_id_key_pk" PRIMARY KEY("company_id","key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(160) NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"employee_id" uuid,
	"client_id" uuid,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"person_type" "person_type" DEFAULT 'PF' NOT NULL,
	"name" varchar(200) NOT NULL,
	"trade_name" varchar(200),
	"document" varchar(18),
	"email" varchar(160),
	"phone" varchar(20),
	"whatsapp" varchar(20),
	"contact_name" varchar(120),
	"zip_code" varchar(9),
	"street" varchar(200),
	"number" varchar(20),
	"complement" varchar(100),
	"district" varchar(120),
	"city" varchar(120),
	"state" varchar(2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_additions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3),
	"unit" varchar(10),
	"value" numeric(14, 2) NOT NULL,
	"extra_days" integer DEFAULT 0 NOT NULL,
	"status" "contract_addition_status" DEFAULT 'pendente' NOT NULL,
	"approved_at" timestamp with time zone,
	"items" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" varchar(30) NOT NULL,
	"client_id" uuid NOT NULL,
	"quote_id" uuid,
	"status" "contract_status" DEFAULT 'aguardando_assinatura' NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"signed_at" date,
	"start_date" date,
	"duration_days" integer,
	"payment_terms" text,
	"down_payment" numeric(14, 2) DEFAULT 0 NOT NULL,
	"installments" integer DEFAULT 1 NOT NULL,
	"retention_rate" numeric(6, 2) DEFAULT 0 NOT NULL,
	"warranty_months" integer,
	"signature_provider" varchar(40),
	"signature_external_id" varchar(120),
	"terms" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid,
	"name" varchar(200) NOT NULL,
	"phone" varchar(20),
	"email" varchar(160),
	"city" varchar(120),
	"source" "lead_source" DEFAULT 'outros' NOT NULL,
	"stage" "lead_stage" DEFAULT 'lead' NOT NULL,
	"estimated_value" numeric(14, 2),
	"seller_id" uuid,
	"lost_reason" varchar(200),
	"description" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"service" varchar(200) NOT NULL,
	"description" text,
	"unit" varchar(10) DEFAULT 'm²' NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"material_unit_cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"labor_unit_cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"system_id" uuid
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_quote_id" uuid,
	"client_id" uuid NOT NULL,
	"lead_id" uuid,
	"visit_id" uuid,
	"title" varchar(200) NOT NULL,
	"site_address" varchar(300),
	"site_city" varchar(120),
	"site_state" varchar(2),
	"status" "quote_status" DEFAULT 'rascunho' NOT NULL,
	"valid_until" date,
	"discount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax_rate" numeric(6, 2) DEFAULT 0 NOT NULL,
	"payment_terms" text,
	"execution_days" integer,
	"warranty_months" integer,
	"notes" text,
	"created_by_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technical_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"lead_id" uuid,
	"client_id" uuid,
	"scheduled_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"address" varchar(300),
	"latitude" varchar(20),
	"longitude" varchar(20),
	"reported_problem" text,
	"infiltration_type" varchar(120),
	"approx_area" numeric(14, 3),
	"probable_causes" text,
	"proposed_solution" text,
	"suggested_materials" text,
	"notes" text,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"client_uuid" uuid,
	"weather" varchar(40),
	"workers_present" integer DEFAULT 0 NOT NULL,
	"hours_worked" numeric(14, 3) DEFAULT 0 NOT NULL,
	"executed_area" numeric(14, 3) DEFAULT 0 NOT NULL,
	"area_id" uuid,
	"activities" text,
	"interferences" text,
	"delays" text,
	"visits" text,
	"occurrences" text,
	"notes" text,
	"equipment_used" text,
	"present_employee_ids" jsonb,
	"signed_by_id" uuid,
	"signed_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid,
	"client_id" uuid,
	"employee_id" uuid,
	"folder" "document_folder" NOT NULL,
	"title" varchar(200) NOT NULL,
	"file_id" uuid,
	"valid_until" date,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"application_type_id" uuid,
	"environment_type" varchar(80),
	"structure_type" varchar(80),
	"location" varchar(160),
	"contracted_area" numeric(14, 3) DEFAULT 0 NOT NULL,
	"measured_area" numeric(14, 3),
	"executed_area" numeric(14, 3) DEFAULT 0 NOT NULL,
	"substrate" varchar(80),
	"substrate_condition" varchar(80),
	"moisture" varchar(40),
	"has_cracks" boolean DEFAULT false NOT NULL,
	"has_fissures" boolean DEFAULT false NOT NULL,
	"needs_leveling" boolean DEFAULT false NOT NULL,
	"slope_ok" boolean,
	"drains" integer DEFAULT 0 NOT NULL,
	"pipes" integer DEFAULT 0 NOT NULL,
	"joints" varchar(160),
	"baseboards" varchar(160),
	"finishing" varchar(160),
	"critical_points" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" "cost_category" NOT NULL,
	"amount" numeric(14, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_cost_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" "cost_category" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"date" date NOT NULL,
	"description" varchar(300) NOT NULL,
	"source" varchar(30) NOT NULL,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"weight" numeric(6, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"file_id" uuid,
	"url" text,
	"area_id" uuid,
	"daily_log_id" uuid,
	"nonconformity_id" uuid,
	"stage" "photo_stage" DEFAULT 'durante' NOT NULL,
	"caption" varchar(200),
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "project_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"label" varchar(60) NOT NULL,
	"color" varchar(20) DEFAULT 'slate' NOT NULL,
	"category" "status_category" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_id" uuid,
	"name" varchar(200) NOT NULL,
	"responsible_id" uuid,
	"planned_start" date NOT NULL,
	"planned_end" date NOT NULL,
	"actual_start" date,
	"actual_end" date,
	"progress" numeric(6, 2) DEFAULT 0 NOT NULL,
	"depends_on_task_id" uuid,
	"planned_area" numeric(14, 3),
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_team_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"client_id" uuid NOT NULL,
	"contract_id" uuid,
	"status_id" uuid NOT NULL,
	"zip_code" varchar(9),
	"address" varchar(300),
	"city" varchar(120),
	"state" varchar(2),
	"latitude" varchar(20),
	"longitude" varchar(20),
	"client_contact_name" varchar(120),
	"client_contact_phone" varchar(20),
	"client_contact_email" varchar(160),
	"engineer_id" uuid,
	"supervisor_id" uuid,
	"foreman_employee_id" uuid,
	"contract_signed_at" date,
	"planned_start" date,
	"actual_start" date,
	"contract_days" integer,
	"planned_end" date,
	"actual_end" date,
	"contract_value" numeric(14, 2) DEFAULT 0 NOT NULL,
	"payment_method" varchar(120),
	"retention_rate" numeric(6, 2) DEFAULT 0 NOT NULL,
	"contracted_area" numeric(14, 3) DEFAULT 0 NOT NULL,
	"daily_target_area" numeric(14, 3),
	"warranty_months" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waterproofing_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	"manufacturer" varchar(120),
	"product_id" uuid,
	"planned_quantity" numeric(14, 3),
	"used_quantity" numeric(14, 3),
	"planned_consumption_per_m2" numeric(14, 3),
	"primer" varchar(120),
	"coats" integer,
	"planned_thickness_mm" numeric(14, 3),
	"executed_thickness_mm" numeric(14, 3),
	"interval_between_coats_hours" integer,
	"cure_hours" integer,
	"method" varchar(120),
	"team_id" uuid,
	"technical_responsible_id" uuid,
	"started_at" date,
	"finished_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waterproofing_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"family" varchar(60) NOT NULL,
	"description" text,
	"default_coats" integer,
	"default_consumption_per_m2" numeric(14, 3),
	"consumption_unit" varchar(10),
	"min_cure_hours" integer,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_trainings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"training_id" uuid NOT NULL,
	"completed_at" date NOT NULL,
	"valid_until" date,
	"certificate_file_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"photo_url" text,
	"cpf" varchar(14),
	"rg" varchar(20),
	"phone" varchar(20),
	"address" varchar(300),
	"job_title" varchar(80) NOT NULL,
	"role" varchar(80),
	"admission_date" date,
	"salary" numeric(14, 2),
	"employment_type" "employment_type" DEFAULT 'clt' NOT NULL,
	"daily_rate" numeric(14, 2),
	"hourly_rate" numeric(14, 2) DEFAULT 0 NOT NULL,
	"pix_key" varchar(120),
	"bank_name" varchar(80),
	"emergency_contact" varchar(200),
	"status" "employee_status" DEFAULT 'ativo' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ppe_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"ppe_item_id" uuid NOT NULL,
	"quantity" numeric(14, 3) DEFAULT 1 NOT NULL,
	"delivered_at" date NOT NULL,
	"next_replacement_at" date,
	"signature_file_id" uuid,
	"delivered_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "ppe_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"ca" varchar(20),
	"ca_valid_until" date,
	"replacement_days" numeric(14, 3)
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"role_in_team" varchar(40) DEFAULT 'aplicador' NOT NULL,
	CONSTRAINT "team_members_team_id_employee_id_pk" PRIMARY KEY("team_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"foreman_id" uuid,
	"color" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"project_id" uuid,
	"date" date NOT NULL,
	"type" time_entry_type DEFAULT 'trabalho' NOT NULL,
	"clock_in" timestamp with time zone,
	"break_start" timestamp with time zone,
	"break_end" timestamp with time zone,
	"clock_out" timestamp with time zone,
	"worked_hours" numeric(14, 3) DEFAULT 0 NOT NULL,
	"overtime_hours" numeric(14, 3) DEFAULT 0 NOT NULL,
	"executed_area" numeric(14, 3) DEFAULT 0 NOT NULL,
	"latitude" varchar(20),
	"longitude" varchar(20),
	"photo_file_id" uuid,
	"client_uuid" uuid,
	"notes" varchar(300),
	"labor_cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"kind" varchar(20) DEFAULT 'treinamento' NOT NULL,
	"validity_months" numeric(14, 3)
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_tag" varchar(30) NOT NULL,
	"name" varchar(160) NOT NULL,
	"category" varchar(60) NOT NULL,
	"brand" varchar(80),
	"status" "equipment_status" DEFAULT 'disponivel' NOT NULL,
	"current_project_id" uuid,
	"current_holder_id" uuid,
	"current_warehouse_id" uuid,
	"checked_out_at" date,
	"expected_return_at" date,
	"next_maintenance_at" date,
	"acquisition_value" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_maintenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"date" date NOT NULL,
	"cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"supplier_id" uuid,
	"description" text,
	"next_review_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"project_id" uuid,
	"employee_id" uuid,
	"date" date NOT NULL,
	"expected_return_at" date,
	"notes" varchar(300),
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_number" varchar(60) NOT NULL,
	"manufactured_at" date,
	"expires_at" date,
	"supplier_id" uuid,
	"blocked" boolean DEFAULT false NOT NULL,
	"block_reason" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sku" varchar(40) NOT NULL,
	"name" varchar(200) NOT NULL,
	"manufacturer" varchar(120),
	"category" varchar(80) NOT NULL,
	"unit" varchar(10) NOT NULL,
	"average_cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"min_stock" numeric(14, 3) DEFAULT 0 NOT NULL,
	"has_technical_sheet" boolean DEFAULT false NOT NULL,
	"technical_sheet_file_id" uuid,
	"safety_sheet_file_id" uuid,
	"system_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"received_quantity" numeric(14, 3) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"request_id" uuid,
	"supplier_id" uuid NOT NULL,
	"project_id" uuid,
	"warehouse_id" uuid,
	"status" "purchase_status" DEFAULT 'pedido_emitido' NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"expected_delivery" date,
	"delivered_at" date,
	"approved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"delivery_days" integer,
	"payment_term_days" integer,
	"selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_request_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"project_id" uuid,
	"requested_by_id" uuid,
	"needed_by" date,
	"status" "purchase_status" DEFAULT 'solicitado' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid,
	"from_warehouse_id" uuid,
	"to_warehouse_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"project_id" uuid,
	"area_id" uuid,
	"employee_id" uuid,
	"purchase_order_id" uuid,
	"date" date NOT NULL,
	"notes" varchar(300),
	"client_uuid" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"legal_name" varchar(200) NOT NULL,
	"trade_name" varchar(200),
	"cnpj" varchar(18),
	"contact_name" varchar(120),
	"phone" varchar(20),
	"whatsapp" varchar(20),
	"email" varchar(160),
	"products_supplied" text,
	"commercial_terms" text,
	"payment_term_days" integer,
	"rating" numeric(14, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" "warehouse_type" NOT NULL,
	"project_id" uuid,
	"vehicle_plate" varchar(10),
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"answer" varchar(10) NOT NULL,
	"photo_file_id" uuid,
	"notes" varchar(300)
);
--> statement-breakpoint
CREATE TABLE "checklist_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"question" varchar(300) NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"photo_required" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"stage" varchar(80),
	"system_id" uuid,
	"reference_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"area_id" uuid,
	"status" "checklist_status" DEFAULT 'aberto' NOT NULL,
	"client_uuid" uuid,
	"filled_by_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"area_id" uuid,
	"date" date NOT NULL,
	"inspector_id" uuid,
	"result" varchar(20) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nonconformities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"area_id" uuid,
	"system_id" uuid,
	"team_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text,
	"severity" "nc_severity" DEFAULT 'media' NOT NULL,
	"cause" varchar(120),
	"corrective_action" text,
	"responsible_id" uuid,
	"detected_at" date NOT NULL,
	"due_date" date,
	"resolved_at" date,
	"status" "nc_status" DEFAULT 'aberta' NOT NULL,
	"is_rework" boolean DEFAULT false NOT NULL,
	"estimated_rework_cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"source" varchar(30) DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"client_uuid" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technical_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"code" varchar(60) NOT NULL,
	"title" varchar(200) NOT NULL,
	"version" varchar(40),
	"file_id" uuid,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tightness_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"area_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"responsible_id" uuid,
	"initial_condition" text,
	"result" text,
	"approved" boolean,
	"notes" text,
	"signature_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts_payable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_id" uuid,
	"employee_id" uuid,
	"project_id" uuid,
	"cost_center_id" uuid,
	"category_id" uuid NOT NULL,
	"purchase_order_id" uuid,
	"description" varchar(200) NOT NULL,
	"document_number" varchar(40),
	"competence_date" date NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"paid_at" date,
	"bank_account_id" uuid,
	"method" "payment_method",
	"receipt_file_id" uuid,
	"approval_status" varchar(20) DEFAULT 'aprovado' NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts_receivable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"contract_id" uuid,
	"measurement_id" uuid,
	"category_id" uuid,
	"description" varchar(200) NOT NULL,
	"installment" integer,
	"installments_total" integer,
	"due_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"interest" numeric(14, 2) DEFAULT 0 NOT NULL,
	"received_amount" numeric(14, 2) DEFAULT 0 NOT NULL,
	"received_at" date,
	"bank_account_id" uuid,
	"method" "payment_method",
	"forecast" boolean DEFAULT false NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"external_charge_id" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"entity_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"description" varchar(300) NOT NULL,
	"required_role" varchar(40) NOT NULL,
	"status" "approval_status" DEFAULT 'pendente' NOT NULL,
	"requested_by_id" uuid,
	"decided_by_id" uuid,
	"decided_at" timestamp with time zone,
	"comment" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"bank" varchar(80),
	"agency" varchar(10),
	"account_number" varchar(20),
	"pix_key" varchar(120),
	"opening_balance" numeric(14, 2) DEFAULT 0 NOT NULL,
	"opening_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"direction" varchar(3) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"date" date NOT NULL,
	"description" varchar(200) NOT NULL,
	"receivable_id" uuid,
	"payable_id" uuid,
	"method" "payment_method",
	"reconciled" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(160) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"project_id" uuid,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" varchar(10) NOT NULL,
	"dre_group" "dre_group" NOT NULL,
	"cost_category" "cost_category"
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" varchar(30),
	"kind" varchar(10) DEFAULT 'nfse' NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"measurement_id" uuid,
	"issue_date" date NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	"provider_payload" jsonb,
	"file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"measurement_id" uuid NOT NULL,
	"area_id" uuid,
	"service" varchar(200) NOT NULL,
	"unit" varchar(10) DEFAULT 'm²' NOT NULL,
	"contracted_quantity" numeric(14, 3) NOT NULL,
	"previous_quantity" numeric(14, 3) DEFAULT 0 NOT NULL,
	"current_quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"value" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "measurement_status" DEFAULT 'executada' NOT NULL,
	"gross_value" numeric(14, 2) DEFAULT 0 NOT NULL,
	"retention_rate" numeric(6, 2) DEFAULT 0 NOT NULL,
	"retention_value" numeric(14, 2) DEFAULT 0 NOT NULL,
	"net_value" numeric(14, 2) DEFAULT 0 NOT NULL,
	"due_date" date,
	"approved_at" timestamp with time zone,
	"approved_by_id" uuid,
	"invoiced_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"delivered_at" date NOT NULL,
	"company_signer_name" varchar(120),
	"client_signer_name" varchar(120),
	"company_signature_file_id" uuid,
	"client_signature_file_id" uuid,
	"notes" text,
	"signed" varchar(5) DEFAULT 'nao' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"warranty_id" uuid,
	"kind" "service_request_kind" NOT NULL,
	"problem" text NOT NULL,
	"opened_at" date NOT NULL,
	"visit_at" date,
	"solution" text,
	"cost" numeric(14, 2) DEFAULT 0 NOT NULL,
	"status" "service_request_status" DEFAULT 'aberta' NOT NULL,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warranties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"area_id" uuid,
	"system_id" uuid,
	"service" varchar(200) NOT NULL,
	"delivered_at" date NOT NULL,
	"months" integer NOT NULL,
	"starts_at" date NOT NULL,
	"ends_at" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_additions" ADD CONSTRAINT "contract_additions_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_visit_id_technical_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."technical_visits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_visits" ADD CONSTRAINT "technical_visits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_visits" ADD CONSTRAINT "technical_visits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_visits" ADD CONSTRAINT "technical_visits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_visits" ADD CONSTRAINT "technical_visits_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_types" ADD CONSTRAINT "application_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_area_id_project_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."project_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_signed_by_id_users_id_fk" FOREIGN KEY ("signed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_areas" ADD CONSTRAINT "project_areas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_areas" ADD CONSTRAINT "project_areas_application_type_id_application_types_id_fk" FOREIGN KEY ("application_type_id") REFERENCES "public"."application_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_cost_entries" ADD CONSTRAINT "project_cost_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_area_id_project_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."project_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_daily_log_id_daily_logs_id_fk" FOREIGN KEY ("daily_log_id") REFERENCES "public"."daily_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_statuses" ADD CONSTRAINT "project_statuses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_team_assignments" ADD CONSTRAINT "project_team_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_status_id_project_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."project_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_engineer_id_users_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waterproofing_applications" ADD CONSTRAINT "waterproofing_applications_area_id_project_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."project_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waterproofing_applications" ADD CONSTRAINT "waterproofing_applications_system_id_waterproofing_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."waterproofing_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waterproofing_applications" ADD CONSTRAINT "waterproofing_applications_technical_responsible_id_users_id_fk" FOREIGN KEY ("technical_responsible_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waterproofing_systems" ADD CONSTRAINT "waterproofing_systems_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_trainings" ADD CONSTRAINT "employee_trainings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_trainings" ADD CONSTRAINT "employee_trainings_training_id_trainings_id_fk" FOREIGN KEY ("training_id") REFERENCES "public"."trainings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_ppe_item_id_ppe_items_id_fk" FOREIGN KEY ("ppe_item_id") REFERENCES "public"."ppe_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_deliveries" ADD CONSTRAINT "ppe_deliveries_delivered_by_id_users_id_fk" FOREIGN KEY ("delivered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ppe_items" ADD CONSTRAINT "ppe_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_foreman_id_employees_id_fk" FOREIGN KEY ("foreman_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_current_project_id_projects_id_fk" FOREIGN KEY ("current_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_current_holder_id_employees_id_fk" FOREIGN KEY ("current_holder_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_current_warehouse_id_warehouses_id_fk" FOREIGN KEY ("current_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_maintenance" ADD CONSTRAINT "equipment_maintenance_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_maintenance" ADD CONSTRAINT "equipment_maintenance_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_movements" ADD CONSTRAINT "equipment_movements_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_movements" ADD CONSTRAINT "equipment_movements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_movements" ADD CONSTRAINT "equipment_movements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_movements" ADD CONSTRAINT "equipment_movements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotes" ADD CONSTRAINT "purchase_quotes_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotes" ADD CONSTRAINT "purchase_quotes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_quotes" ADD CONSTRAINT "purchase_quotes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_request_id_purchase_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_area_id_project_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."project_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_answers" ADD CONSTRAINT "checklist_answers_item_id_checklist_template_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."checklist_template_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_system_id_waterproofing_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."waterproofing_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_reference_id_technical_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."technical_references"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_area_id_project_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."project_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_filled_by_id_users_id_fk" FOREIGN KEY ("filled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_area_id_project_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."project_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_area_id_project_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."project_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_system_id_waterproofing_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."waterproofing_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nonconformities" ADD CONSTRAINT "nonconformities_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_references" ADD CONSTRAINT "technical_references_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_references" ADD CONSTRAINT "technical_references_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tightness_tests" ADD CONSTRAINT "tightness_tests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tightness_tests" ADD CONSTRAINT "tightness_tests_area_id_project_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."project_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tightness_tests" ADD CONSTRAINT "tightness_tests_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_receipt_file_id_files_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_measurement_id_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."measurements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_category_id_financial_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."financial_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_receivable_id_accounts_receivable_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."accounts_receivable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_payable_id_accounts_payable_id_fk" FOREIGN KEY ("payable_id") REFERENCES "public"."accounts_payable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_categories" ADD CONSTRAINT "financial_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_measurement_id_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."measurements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_items" ADD CONSTRAINT "measurement_items_measurement_id_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."measurements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_items" ADD CONSTRAINT "measurement_items_area_id_project_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."project_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_terms" ADD CONSTRAINT "delivery_terms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_warranty_id_warranties_id_fk" FOREIGN KEY ("warranty_id") REFERENCES "public"."warranties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_area_id_project_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."project_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_system_id_waterproofing_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."waterproofing_systems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "files_company_idx" ON "files" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_company_key_uq" ON "roles" USING btree ("company_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "clients_company_name_idx" ON "clients" USING btree ("company_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_company_document_uq" ON "clients" USING btree ("company_id","document");--> statement-breakpoint
CREATE UNIQUE INDEX "contracts_number_uq" ON "contracts" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "leads_stage_idx" ON "leads" USING btree ("company_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_version_uq" ON "quotes" USING btree ("company_id","number","version");--> statement-breakpoint
CREATE INDEX "daily_logs_project_date_idx" ON "daily_logs" USING btree ("project_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_logs_client_uuid_uq" ON "daily_logs" USING btree ("client_uuid");--> statement-breakpoint
CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id","folder");--> statement-breakpoint
CREATE INDEX "areas_project_idx" ON "project_areas" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_budget_cat_uq" ON "project_budgets" USING btree ("project_id","category");--> statement-breakpoint
CREATE INDEX "cost_entries_project_idx" ON "project_cost_entries" USING btree ("project_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_entries_source_uq" ON "project_cost_entries" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "photos_project_idx" ON "project_photos" USING btree ("project_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "project_status_key_uq" ON "project_statuses" USING btree ("company_id","key");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code_uq" ON "projects" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_cpf_uq" ON "employees" USING btree ("company_id","cpf");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_emp_date_uq" ON "time_entries" USING btree ("employee_id","date");--> statement-breakpoint
CREATE INDEX "time_entries_project_idx" ON "time_entries" USING btree ("project_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_client_uuid_uq" ON "time_entries" USING btree ("client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_tag_uq" ON "equipment" USING btree ("company_id","asset_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_product_number_uq" ON "product_batches" USING btree ("product_id","batch_number");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_uq" ON "products" USING btree ("company_id","sku");--> statement-breakpoint
CREATE INDEX "stock_mov_product_idx" ON "stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stock_mov_project_idx" ON "stock_movements" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_mov_client_uuid_uq" ON "stock_movements" USING btree ("client_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_cnpj_uq" ON "suppliers" USING btree ("company_id","cnpj");--> statement-breakpoint
CREATE INDEX "checklists_project_idx" ON "checklists" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "nc_project_status_idx" ON "nonconformities" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "ap_due_idx" ON "accounts_payable" USING btree ("company_id","due_date");--> statement-breakpoint
CREATE INDEX "ap_project_idx" ON "accounts_payable" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ar_due_idx" ON "accounts_receivable" USING btree ("company_id","due_date");--> statement-breakpoint
CREATE INDEX "ar_project_idx" ON "accounts_receivable" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ar_measurement_uq" ON "accounts_receivable" USING btree ("measurement_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approval_requests" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "cash_tx_date_idx" ON "cash_transactions" USING btree ("company_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centers_code_uq" ON "cost_centers" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_project_number_uq" ON "measurements" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "warranties_ends_idx" ON "warranties" USING btree ("ends_at");