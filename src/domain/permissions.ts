/**
 * RBAC (§51). Permissões são strings "modulo:acao". Os perfis abaixo são o
 * padrão de fábrica gravado no seed; o administrador pode ajustá-los
 * (tabela role_permissions). A verificação SEMPRE acontece no backend.
 */
export const PERMISSIONS = {
  "dashboard:view": "Ver dashboard executivo",
  "owner:view": "Ver Central do Dono",
  "insights:view": "Ver Revolution Insights",
  "clients:view": "Ver clientes",
  "clients:edit": "Cadastrar/editar clientes",
  "crm:view": "Ver comercial (leads, visitas, orçamentos)",
  "crm:edit": "Editar comercial",
  "quotes:approve": "Aprovar orçamentos (gera contrato e obra)",
  "projects:view": "Ver obras",
  "projects:edit": "Cadastrar/editar obras",
  "projects:finance": "Ver financeiro das obras (custos, margem)",
  "field:use": "Usar app de campo (diário, fotos, material, ocorrência)",
  "measurements:edit": "Lançar medições",
  "measurements:approve": "Aprovar/faturar medições",
  "quality:edit": "Registrar qualidade e não conformidades",
  "employees:view": "Ver funcionários",
  "employees:edit": "Cadastrar/editar funcionários",
  "employees:sensitive": "Ver salários e dados bancários",
  "timesheet:self": "Bater o próprio ponto",
  "timesheet:manage": "Gerenciar ponto da equipe",
  "finance:view": "Ver financeiro",
  "finance:edit": "Lançar contas a pagar/receber",
  "finance:settle": "Dar baixa em pagamentos/recebimentos",
  "stock:view": "Ver estoque",
  "stock:move": "Movimentar estoque",
  "purchases:edit": "Compras",
  "suppliers:edit": "Cadastrar fornecedores",
  "equipment:edit": "Patrimônio e equipamentos",
  "reports:view": "Relatórios",
  "settings:manage": "Configurações e usuários",
  "audit:view": "Ver auditoria",
  "approvals:decide": "Decidir aprovações",
  "portal:view": "Portal do cliente",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

const ALL = ALL_PERMISSIONS;
const without = (...p: Permission[]) => ALL.filter((x) => !p.includes(x));

export interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export const DEFAULT_ROLES: RoleDefinition[] = [
  { key: "admin", name: "Administrador", description: "Acesso total ao sistema.", permissions: without("portal:view") },
  {
    key: "diretoria",
    name: "Diretoria",
    description: "Visão gerencial completa e aprovações.",
    permissions: without("portal:view", "settings:manage"),
  },
  {
    key: "financeiro",
    name: "Financeiro",
    description: "Contas, fluxo de caixa e DRE.",
    permissions: [
      "dashboard:view", "clients:view", "projects:view", "projects:finance", "finance:view", "finance:edit",
      "finance:settle", "measurements:approve", "employees:view", "employees:sensitive", "reports:view",
      "approvals:decide", "suppliers:edit", "stock:view",
    ],
  },
  {
    key: "comercial",
    name: "Comercial",
    description: "Leads, visitas, orçamentos e contratos.",
    permissions: ["dashboard:view", "clients:view", "clients:edit", "crm:view", "crm:edit", "projects:view", "reports:view", "approvals:decide"],
  },
  {
    key: "engenheiro",
    name: "Engenheiro",
    description: "Gestão técnica de obras, medições e qualidade.",
    permissions: [
      "dashboard:view", "clients:view", "crm:view", "projects:view", "projects:edit", "projects:finance", "field:use",
      "measurements:edit", "measurements:approve", "quality:edit", "employees:view", "timesheet:manage",
      "stock:view", "stock:move", "purchases:edit", "equipment:edit", "reports:view", "insights:view", "approvals:decide",
    ],
  },
  {
    key: "supervisor",
    name: "Supervisor",
    description: "Acompanha as obras e equipes em campo.",
    permissions: [
      "dashboard:view", "projects:view", "projects:edit", "field:use", "measurements:edit", "quality:edit",
      "employees:view", "timesheet:manage", "timesheet:self", "stock:view", "stock:move", "purchases:edit",
      "equipment:edit", "approvals:decide",
    ],
  },
  {
    key: "encarregado",
    name: "Encarregado",
    description: "Operação diária da obra pelo celular.",
    permissions: ["projects:view", "field:use", "quality:edit", "timesheet:self", "timesheet:manage", "stock:view", "stock:move"],
  },
  {
    key: "aplicador",
    name: "Funcionário/Aplicador",
    description: "Ponto, obra atual e checklists.",
    permissions: ["field:use", "timesheet:self"],
  },
  {
    key: "compras",
    name: "Compras",
    description: "Solicitações, cotações e pedidos.",
    permissions: ["projects:view", "stock:view", "stock:move", "purchases:edit", "suppliers:edit", "finance:view"],
  },
  {
    key: "estoque",
    name: "Estoque",
    description: "Movimentação e controle de estoque.",
    permissions: ["projects:view", "stock:view", "stock:move", "equipment:edit"],
  },
  { key: "cliente", name: "Cliente", description: "Portal do cliente (sem custos internos).", permissions: ["portal:view"] },
  {
    key: "contador",
    name: "Contador",
    description: "Consulta financeira e relatórios.",
    permissions: ["finance:view", "reports:view", "clients:view", "projects:view"],
  },
];

export function hasPermission(granted: Iterable<string>, required: Permission | Permission[]): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  const list = Array.isArray(required) ? required : [required];
  return list.every((p) => set.has(p));
}

export function hasAnyPermission(granted: Iterable<string>, required: Permission[]): boolean {
  const set = granted instanceof Set ? granted : new Set(granted);
  return required.some((p) => set.has(p));
}
