import { asc, eq } from "drizzle-orm";
import { csvResponse, toCsv } from "@/lib/csv";
import { hasPermission, type Permission } from "@/domain/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { clients, employees } from "@/server/db/schema";
import { listPayables, listReceivables, PAYABLE_STATUS, RECEIVABLE_STATUS } from "@/server/services/finance-lists";
import { filterProjects } from "@/server/services/project-filters";
import { loadProjectSummaries } from "@/server/services/project-summary";
import { stockOverview } from "@/server/services/stock";
import { audit } from "@/server/audit";

const REQUIRED: Record<string, Permission> = {
  obras: "projects:view",
  receber: "finance:view",
  pagar: "finance:view",
  funcionarios: "employees:view",
  estoque: "stock:view",
  clientes: "clients:view",
};

const d = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "");

/** Exportação Excel/CSV (§56, §71). Respeita as mesmas permissões e filtros da tela. */
export async function GET(req: Request, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  const perm = REQUIRED[entity];
  if (!perm) return new Response("Exportação inexistente", { status: 404 });
  if (!hasPermission(user.permissions, perm)) return new Response("Sem permissão", { status: 403 });
  const f = Object.fromEntries(new URL(req.url).searchParams.entries());
  const stamp = new Date().toISOString().slice(0, 10);
  let csv = "";

  if (entity === "obras") {
    const list = filterProjects(await loadProjectSummaries(user.companyId), f);
    const fin = hasPermission(user.permissions, "projects:finance");
    csv = toCsv(
      ["Código", "Obra", "Cliente", "Cidade", "Status", "Semáforo", "Avanço %", "Término contratual", "Previsão de término", "Atraso (dias)", ...(fin ? ["Receita", "Custo incorrido", "Custo projetado", "Lucro projetado", "Margem projetada %", "Recebido"] : [])],
      list.map((p) => [
        p.code, p.name, p.clientName, p.city, p.statusLabel, p.health.level, Math.round(p.physicalProgress * 1000) / 10, d(p.adjustedPlannedEnd), d(p.forecast.forecastEnd), p.forecast.delayDays,
        ...(fin ? [p.finance.revenue, p.finance.incurredCost, p.finance.projectedCost, p.finance.projectedProfit, p.finance.projectedMargin, p.finance.received] : []),
      ]),
    );
  } else if (entity === "receber") {
    const { items } = await listReceivables(user.companyId, f);
    csv = toCsv(
      ["Vencimento", "Cliente", "Obra", "Descrição", "Valor", "Desconto", "Juros", "Recebido", "Em aberto", "Status", "Data recebimento"],
      items.map((r) => [d(r.dueDate), r.clientName, r.projectCode, r.description, r.amount, r.discount, r.interest, r.receivedAmount, r.open, RECEIVABLE_STATUS[r.status].label, d(r.receivedAt)]),
    );
  } else if (entity === "pagar") {
    const { items } = await listPayables(user.companyId, f);
    csv = toCsv(
      ["Vencimento", "Fornecedor/Funcionário", "Categoria", "Obra", "Descrição", "Documento", "Valor", "Pago", "Em aberto", "Status"],
      items.map((p) => [d(p.dueDate), p.supplierName ?? p.employeeName, p.categoryName, p.projectCode, p.description, p.documentNumber, p.amount, p.paidAmount, p.open, PAYABLE_STATUS[p.status].label]),
    );
  } else if (entity === "funcionarios") {
    const sensitive = hasPermission(user.permissions, "employees:sensitive");
    const rows = await db.select().from(employees).where(eq(employees.companyId, user.companyId)).orderBy(asc(employees.name));
    csv = toCsv(
      ["Nome", "Cargo", "Função", "Telefone", "Admissão", "Contratação", "Status", ...(sensitive ? ["CPF", "Salário", "Valor hora", "Diária", "PIX"] : [])],
      rows.map((e) => [e.name, e.jobTitle, e.role, e.phone, d(e.admissionDate), e.employmentType, e.status, ...(sensitive ? [e.cpf, e.salary, e.hourlyRate, e.dailyRate, e.pixKey] : [])]),
    );
  } else if (entity === "estoque") {
    const s = await stockOverview(user.companyId);
    csv = toCsv(
      ["SKU", "Produto", "Fabricante", "Categoria", "Unidade", "Saldo total", "Saldo central", "Mínimo", "Custo médio", "Valor", "Lotes vencidos", "Lotes vencendo"],
      s.rows.map((r) => [r.sku, r.name, r.manufacturer, r.category, r.unit, r.total, r.central, r.minStock, r.averageCost, r.value, r.expired, r.expiring]),
    );
  } else if (entity === "clientes") {
    const rows = await db.select().from(clients).where(eq(clients.companyId, user.companyId)).orderBy(asc(clients.name));
    csv = toCsv(["Nome", "Tipo", "CPF/CNPJ", "Contato", "Telefone", "WhatsApp", "E-mail", "Cidade", "UF"], rows.map((c) => [c.name, c.personType, c.document, c.contactName, c.phone, c.whatsapp, c.email, c.city, c.state]));
  }

  await audit(db, { id: user.id, companyId: user.companyId }, "export", entity, null, undefined, f);
  return csvResponse(`revolution-${entity}-${stamp}.csv`, csv);
}
