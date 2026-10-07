/** Resultado padrão de server actions — consumido por <ActionForm>. */
export type ActionResult =
  | { ok: true; message?: string; redirectTo?: string; data?: Record<string, unknown> }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const initialActionState: ActionResult | null = null;
