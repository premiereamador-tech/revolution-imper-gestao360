export type ApprovalKind = "compra" | "despesa" | "desconto" | "aditivo" | "medicao" | "pagamento";

export interface ApprovalTier {
  /** Valor máximo (inclusive) que este perfil pode aprovar. null = sem limite. */
  maxAmount: number | null;
  role: string;
}

export type ApprovalRules = Record<ApprovalKind, ApprovalTier[]>;

/** Padrão do §74 — configurável em Configurações › Aprovações. */
export const DEFAULT_APPROVAL_RULES: ApprovalRules = {
  compra: [
    { maxAmount: 500, role: "supervisor" },
    { maxAmount: null, role: "diretoria" },
  ],
  despesa: [
    { maxAmount: 500, role: "supervisor" },
    { maxAmount: null, role: "diretoria" },
  ],
  desconto: [
    { maxAmount: 1000, role: "comercial" },
    { maxAmount: null, role: "diretoria" },
  ],
  aditivo: [{ maxAmount: null, role: "diretoria" }],
  medicao: [
    { maxAmount: 50_000, role: "engenheiro" },
    { maxAmount: null, role: "diretoria" },
  ],
  pagamento: [
    { maxAmount: 2000, role: "financeiro" },
    { maxAmount: null, role: "diretoria" },
  ],
};

/** Hierarquia: um perfil superior pode aprovar o que um inferior aprova. */
export const ROLE_RANK: Record<string, number> = {
  encarregado: 1,
  supervisor: 2,
  comercial: 2,
  compras: 2,
  financeiro: 3,
  engenheiro: 3,
  diretoria: 9,
  admin: 10,
};

export function requiredApprover(kind: ApprovalKind, amount: number, rules: ApprovalRules = DEFAULT_APPROVAL_RULES): string {
  const tiers = [...rules[kind]].sort((a, b) => (a.maxAmount ?? Infinity) - (b.maxAmount ?? Infinity));
  const tier = tiers.find((t) => t.maxAmount === null || amount <= t.maxAmount);
  return tier?.role ?? "diretoria";
}

export function canApprove(userRole: string, requiredRole: string): boolean {
  // O perfil exigido aprova; diretoria e administrador aprovam qualquer alçada.
  return userRole === requiredRole || (ROLE_RANK[userRole] ?? 0) >= ROLE_RANK.diretoria;
}
