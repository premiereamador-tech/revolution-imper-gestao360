import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import {
  accountsPayable,
  accountsReceivable,
  clients,
  employees,
  financialCategories,
  projects,
  suppliers,
} from "@/server/db/schema";
import { todayISO } from "@/domain/dates";
import { netDue, openBalance, receivableStatus, type ReceivableStatus } from "@/domain/receivables";
import { round2 } from "@/domain/money";

export interface FinanceFilter {
  q?: string;
  status?: string;
  de?: string;
  ate?: string;
  obra?: string;
  cliente?: string;
  previsao?: string;
}

export async function listReceivables(companyId: string, f: FinanceFilter) {
  const today = todayISO();
  const conds: (SQL | undefined)[] = [eq(accountsReceivable.companyId, companyId)];
  if (f.de) conds.push(sql`${accountsReceivable.dueDate} >= ${f.de}`);
  if (f.ate) conds.push(sql`${accountsReceivable.dueDate} <= ${f.ate}`);
  if (f.obra) conds.push(eq(accountsReceivable.projectId, f.obra));
  if (f.cliente) conds.push(eq(accountsReceivable.clientId, f.cliente));
  if (f.q) conds.push(or(ilike(accountsReceivable.description, `%${f.q}%`), ilike(clients.name, `%${f.q}%`)));
  const rows = await db
    .select({ r: accountsReceivable, clientName: clients.name, projectCode: projects.code, projectName: projects.name })
    .from(accountsReceivable)
    .innerJoin(clients, eq(clients.id, accountsReceivable.clientId))
    .leftJoin(projects, eq(projects.id, accountsReceivable.projectId))
    .where(and(...conds))
    .orderBy(asc(accountsReceivable.dueDate))
    .limit(2000);
  const items = rows
    .map((x) => ({
      ...x.r,
      clientName: x.clientName,
      projectCode: x.projectCode,
      projectName: x.projectName,
      net: netDue(x.r),
      open: openBalance(x.r),
      status: receivableStatus(x.r, today) as ReceivableStatus,
    }))
    .filter((x) => (f.status ? x.status === f.status : x.status !== "cancelado"))
    .filter((x) => (f.previsao === "nao" ? !x.forecast : true));
  const sum = (s: ReceivableStatus[]) => round2(items.filter((i) => s.includes(i.status)).reduce((a, i) => a + i.open, 0));
  return {
    items,
    totals: {
      open: sum(["a_vencer", "vencido", "parcial", "previsto"]),
      overdue: sum(["vencido"]),
      dueSoon: sum(["a_vencer", "parcial"]),
      forecast: sum(["previsto"]),
      received: round2(items.reduce((a, i) => a + i.receivedAmount, 0)),
    },
  };
}

export type PayableStatus = "pendente_aprovacao" | "a_vencer" | "vencido" | "parcial" | "pago" | "cancelado";

export async function listPayables(companyId: string, f: FinanceFilter & { categoria?: string; fornecedor?: string }) {
  const today = todayISO();
  const conds: (SQL | undefined)[] = [eq(accountsPayable.companyId, companyId)];
  if (f.de) conds.push(sql`${accountsPayable.dueDate} >= ${f.de}`);
  if (f.ate) conds.push(sql`${accountsPayable.dueDate} <= ${f.ate}`);
  if (f.obra) conds.push(eq(accountsPayable.projectId, f.obra));
  if (f.categoria) conds.push(eq(accountsPayable.categoryId, f.categoria));
  if (f.fornecedor) conds.push(eq(accountsPayable.supplierId, f.fornecedor));
  if (f.q) conds.push(or(ilike(accountsPayable.description, `%${f.q}%`), ilike(suppliers.legalName, `%${f.q}%`), ilike(suppliers.tradeName, `%${f.q}%`)));
  const rows = await db
    .select({ p: accountsPayable, supplierName: sql<string | null>`coalesce(${suppliers.tradeName}, ${suppliers.legalName})`, employeeName: employees.name, categoryName: financialCategories.name, projectCode: projects.code })
    .from(accountsPayable)
    .innerJoin(financialCategories, eq(financialCategories.id, accountsPayable.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, accountsPayable.supplierId))
    .leftJoin(employees, eq(employees.id, accountsPayable.employeeId))
    .leftJoin(projects, eq(projects.id, accountsPayable.projectId))
    .where(and(...conds))
    .orderBy(asc(accountsPayable.dueDate))
    .limit(2000);
  const items = rows
    .map((x) => {
      const open = round2(x.p.amount - x.p.paidAmount);
      const status: PayableStatus = x.p.cancelled
        ? "cancelado"
        : x.p.approvalStatus === "pendente"
          ? "pendente_aprovacao"
          : open <= 0
            ? "pago"
            : x.p.paidAmount > 0
              ? x.p.dueDate < today ? "vencido" : "parcial"
              : x.p.dueDate < today
                ? "vencido"
                : "a_vencer";
      return { ...x.p, supplierName: x.supplierName, employeeName: x.employeeName, categoryName: x.categoryName, projectCode: x.projectCode, open, status };
    })
    .filter((x) => (f.status ? x.status === f.status : x.status !== "cancelado"));
  const sum = (s: PayableStatus[]) => round2(items.filter((i) => s.includes(i.status)).reduce((a, i) => a + i.open, 0));
  return { items, totals: { open: sum(["a_vencer", "vencido", "parcial", "pendente_aprovacao"]), overdue: sum(["vencido"]), pendingApproval: sum(["pendente_aprovacao"]), paid: round2(items.reduce((a, i) => a + i.paidAmount, 0)) } };
}

export const RECEIVABLE_STATUS: Record<ReceivableStatus, { label: string; tone: string }> = {
  previsto: { label: "Previsto", tone: "slate" },
  a_vencer: { label: "A vencer", tone: "blue" },
  vencido: { label: "Vencido", tone: "red" },
  parcial: { label: "Parcial", tone: "amber" },
  recebido: { label: "Recebido", tone: "green" },
  cancelado: { label: "Cancelado", tone: "slate" },
};

export const PAYABLE_STATUS: Record<PayableStatus, { label: string; tone: string }> = {
  pendente_aprovacao: { label: "Aguardando aprovação", tone: "violet" },
  a_vencer: { label: "A vencer", tone: "blue" },
  vencido: { label: "Vencido", tone: "red" },
  parcial: { label: "Parcial", tone: "amber" },
  pago: { label: "Pago", tone: "green" },
  cancelado: { label: "Cancelado", tone: "slate" },
};
