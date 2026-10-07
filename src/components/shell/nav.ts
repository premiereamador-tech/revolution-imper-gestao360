import type { Permission } from "@/domain/permissions";

export interface NavItem {
  label: string;
  href: string;
  permission: Permission | Permission[];
  icon?: string;
}
export interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}
export type NavEntry = NavItem | NavGroup;

/** Menu principal (§85). Cada item só aparece para quem tem permissão. */
export const NAV: NavEntry[] = [
  { label: "Dashboard", href: "/", permission: "dashboard:view", icon: "layout-dashboard" },
  { label: "Central do Dono", href: "/central-do-dono", permission: "owner:view", icon: "gauge" },
  { label: "Meu dia em campo", href: "/campo", permission: "field:use", icon: "hard-hat" },
  {
    label: "Comercial",
    icon: "briefcase",
    items: [
      { label: "Leads", href: "/comercial/leads", permission: "crm:view" },
      { label: "Visitas técnicas", href: "/comercial/visitas", permission: "crm:view" },
      { label: "Orçamentos", href: "/comercial/orcamentos", permission: "crm:view" },
    ],
  },
  {
    label: "Obras",
    icon: "building",
    items: [
      { label: "Todas as obras", href: "/obras", permission: "projects:view" },
      { label: "Medições", href: "/obras/medicoes", permission: "projects:view" },
      { label: "Qualidade", href: "/obras/qualidade", permission: "projects:view" },
    ],
  },
  {
    label: "Equipe",
    icon: "users",
    items: [
      { label: "Funcionários", href: "/equipe/funcionarios", permission: "employees:view" },
      { label: "Equipes", href: "/equipe/equipes", permission: "employees:view" },
      { label: "Ponto", href: "/equipe/ponto", permission: "timesheet:manage" },
      { label: "Produtividade", href: "/equipe/produtividade", permission: "employees:view" },
      { label: "Segurança", href: "/equipe/seguranca", permission: "employees:view" },
    ],
  },
  {
    label: "Financeiro",
    icon: "wallet",
    items: [
      { label: "Visão geral", href: "/financeiro", permission: "finance:view" },
      { label: "Contas a receber", href: "/financeiro/receber", permission: "finance:view" },
      { label: "Contas a pagar", href: "/financeiro/pagar", permission: "finance:view" },
      { label: "Fluxo de caixa", href: "/financeiro/fluxo-de-caixa", permission: "finance:view" },
      { label: "DRE", href: "/financeiro/dre", permission: "finance:view" },
      { label: "Aprovações", href: "/aprovacoes", permission: "approvals:decide" },
    ],
  },
  {
    label: "Suprimentos",
    icon: "package",
    items: [
      { label: "Estoque", href: "/suprimentos/estoque", permission: "stock:view" },
      { label: "Fornecedores", href: "/suprimentos/fornecedores", permission: "stock:view" },
    ],
  },
  { label: "Patrimônio", href: "/patrimonio", permission: "equipment:edit", icon: "wrench" },
  { label: "Clientes", href: "/clientes", permission: "clients:view", icon: "contact" },
  { label: "Garantias", href: "/garantias", permission: "projects:view", icon: "shield" },
  { label: "Revolution Insights", href: "/insights", permission: "insights:view", icon: "sparkles" },
  { label: "Configurações", href: "/configuracoes", permission: "settings:manage", icon: "settings" },
];

export function isGroup(e: NavEntry): e is NavGroup {
  return "items" in e;
}
