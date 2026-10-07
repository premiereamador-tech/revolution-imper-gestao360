export const EMP_STATUS: Record<string, { label: string; tone: string }> = {
  ativo: { label: "Ativo", tone: "green" },
  afastado: { label: "Afastado", tone: "amber" },
  ferias: { label: "Férias", tone: "blue" },
  desligado: { label: "Desligado", tone: "slate" },
};

export const QUOTE_STATUS: Record<string, { label: string; tone: string }> = {
  rascunho: { label: "Rascunho", tone: "slate" },
  enviado: { label: "Enviado", tone: "blue" },
  aprovado: { label: "Aprovado", tone: "green" },
  reprovado: { label: "Reprovado", tone: "red" },
  expirado: { label: "Expirado", tone: "amber" },
};
