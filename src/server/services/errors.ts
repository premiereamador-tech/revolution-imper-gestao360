/** Erro de regra de negócio — a mensagem é segura para mostrar ao usuário. */
export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessError";
  }
}

export function assertFound<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new BusinessError(`${what} não encontrado(a).`);
  return v;
}
