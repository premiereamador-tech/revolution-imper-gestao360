"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useActionState, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/cn";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./primitives";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/**
 * Formulário ligado a uma server action. Mostra erros por campo, mensagem de
 * sucesso, bloqueia duplo envio e redireciona quando a action pede.
 */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  resetOnSuccess = false,
  successMessage = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  onSuccess?: (r: Extract<ActionResult, { ok: true }>) => void;
  resetOnSuccess?: boolean;
  successMessage?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const last = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (state.redirectTo) router.push(state.redirectTo);
      else router.refresh();
    }
  }, [state, onSuccess, resetOnSuccess, router]);

  return (
    <form ref={formRef} action={formAction} className={className} noValidate>
      <FormErrorsContext value={state && !state.ok ? state.fieldErrors ?? {} : {}}>{children}</FormErrorsContext>
      {state && !state.ok && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state && state.ok && state.message && successMessage && (
        <p role="status" className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      )}
    </form>
  );
}

const FormErrors = createContext<Record<string, string>>({});
function FormErrorsContext({ value, children }: { value: Record<string, string>; children: ReactNode }) {
  return <FormErrors value={value}>{children}</FormErrors>;
}
export function useFieldError(name?: string) {
  const errs = use(FormErrors);
  return name ? errs[name] : undefined;
}

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingLabel = "Salvando…", ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending ? pendingLabel : children}
    </button>
  );
}

const inputBase =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:bg-surface-2";

export function Label({ htmlFor, children, required }: { htmlFor?: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[13px] font-medium text-text">
      {children}
      {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
    </label>
  );
}

function FieldWrap({ name, label, required, hint, children, className }: { name?: string; label?: string; required?: boolean; hint?: string; children: ReactNode; className?: string }) {
  const error = useFieldError(name);
  return (
    <div className={className}>
      {label && (
        <Label htmlFor={name} required={required}>
          {label}
        </Label>
      )}
      {children}
      {error ? <p className="mt-1 text-[12px] text-danger">{error}</p> : hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Input({ label, hint, className, wrapClassName, ...props }: ComponentProps<"input"> & { label?: string; hint?: string; wrapClassName?: string }) {
  const error = useFieldError(props.name);
  return (
    <FieldWrap name={props.name} label={label} required={props.required} hint={hint} className={wrapClassName}>
      <input id={props.id ?? props.name} aria-invalid={!!error} className={cn(inputBase, "h-10", error && "border-danger", className)} {...props} />
    </FieldWrap>
  );
}

export function MoneyInput(props: ComponentProps<"input"> & { label?: string; hint?: string; wrapClassName?: string }) {
  return <Input inputMode="decimal" placeholder="0,00" {...props} className={cn("tabular text-right", props.className)} />;
}

export function DateInput(props: ComponentProps<"input"> & { label?: string; hint?: string; wrapClassName?: string }) {
  return <Input type="date" {...props} />;
}

export function Textarea({ label, hint, className, wrapClassName, ...props }: ComponentProps<"textarea"> & { label?: string; hint?: string; wrapClassName?: string }) {
  const error = useFieldError(props.name);
  return (
    <FieldWrap name={props.name} label={label} required={props.required} hint={hint} className={wrapClassName}>
      <textarea id={props.id ?? props.name} rows={3} aria-invalid={!!error} className={cn(inputBase, "py-2", error && "border-danger", className)} {...props} />
    </FieldWrap>
  );
}

export function Select({
  label,
  hint,
  options,
  placeholder,
  className,
  wrapClassName,
  ...props
}: ComponentProps<"select"> & { label?: string; hint?: string; wrapClassName?: string; placeholder?: string; options: Array<{ value: string; label: string }> }) {
  const error = useFieldError(props.name);
  return (
    <FieldWrap name={props.name} label={label} required={props.required} hint={hint} className={wrapClassName}>
      <select id={props.id ?? props.name} aria-invalid={!!error} className={cn(inputBase, "h-10 pr-8", error && "border-danger", className)} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  );
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text">
      <input type="checkbox" className="size-4 rounded border-border accent-[var(--primary)]" {...props} />
      {label}
    </label>
  );
}
