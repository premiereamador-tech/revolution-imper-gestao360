import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { bankAccounts, clients, employees, financialCategories, suppliers } from "@/server/db/schema";
import { projectsForSelect } from "./projects";

export async function financeOptions(companyId: string) {
  const [banks, categories, supplierList, employeeList, projectList, clientList] = await Promise.all([
    db.select({ id: bankAccounts.id, name: bankAccounts.name }).from(bankAccounts).where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.active, true))),
    db.select().from(financialCategories).where(eq(financialCategories.companyId, companyId)).orderBy(asc(financialCategories.name)),
    db.select({ id: suppliers.id, name: suppliers.legalName, trade: suppliers.tradeName }).from(suppliers).where(eq(suppliers.companyId, companyId)).orderBy(asc(suppliers.legalName)),
    db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.companyId, companyId)).orderBy(asc(employees.name)),
    projectsForSelect(companyId, false),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.companyId, companyId)).orderBy(asc(clients.name)),
  ]);
  return {
    banks: banks.map((b) => ({ value: b.id, label: b.name })),
    expenseCategories: categories.filter((c) => c.type === "despesa").map((c) => ({ value: c.id, label: c.name })),
    suppliers: supplierList.map((s) => ({ value: s.id, label: s.trade ?? s.name })),
    employees: employeeList.map((e) => ({ value: e.id, label: e.name })),
    projects: projectList.map((p) => ({ value: p.id, label: `${p.code} ${p.name}` })),
    clients: clientList.map((c) => ({ value: c.id, label: c.name })),
  };
}

export const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
  { value: "cartao", label: "Cartão" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
];
