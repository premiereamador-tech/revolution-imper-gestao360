"use client";

import { useCallback, type ReactNode } from "react";
import { toast } from "./toaster";
import type { ActionResult } from "@/lib/action-result";
import { ActionForm, SubmitButton } from "./form";
import { Modal } from "./modal";
import type { ButtonSize, ButtonVariant } from "./primitives";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Envolve a action para disparar o aviso de sucesso assim que ela responde —
 * mesmo que a linha/modal deixe de existir após a atualização da página
 * (ex.: item sai do filtro atual depois de pago).
 */
function useToastingAction(action: Action): Action {
  return useCallback(
    async (prev, fd) => {
      const r = await action(prev, fd);
      if (r.ok && r.message) toast(r.message);
      return r;
    },
    [action],
  );
}

/** Botão que abre um formulário em modal; fecha sozinho quando a ação conclui. Utilizável a partir de Server Components. */
export function FormModal({
  trigger,
  title,
  description,
  action,
  children,
  submitLabel = "Salvar",
  variant = "primary",
  size = "md",
  wide,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  wide?: boolean;
}) {
  const run = useToastingAction(action);
  return (
    <Modal trigger={trigger} title={title} description={description} variant={variant} size={size} wide={wide}>
      {(close) => (
        <ActionForm
          action={run}
          successMessage={false}
          onSuccess={() => close()}
          className="space-y-4"
        >
          {children}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={close} className="h-10 rounded-lg px-4 text-sm text-muted hover:bg-surface-2">
              Cancelar
            </button>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}

/** Formulário de um botão só (ex.: "Aprovar"), com campos ocultos. */
export function InlineActionButton({
  action,
  fields,
  children,
  variant = "secondary",
  size = "sm",
  confirm,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  fields: Record<string, string>;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  confirm?: string;
}) {
  const run = useToastingAction(action);
  return (
    <ActionForm action={run} className="inline-block" successMessage={false}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton
        variant={variant}
        size={size}
        pendingLabel="…"
        onClick={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        {children}
      </SubmitButton>
    </ActionForm>
  );
}
