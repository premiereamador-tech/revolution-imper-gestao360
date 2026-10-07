"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { X } from "lucide-react";
import { deleteFilterAction, saveFilterAction } from "@/app/(app)/filtros/actions";
import { cn } from "@/lib/cn";
import { ActionForm, Input, SubmitButton } from "./form";

export interface FilterField {
  name: string;
  label: string;
  type: "search" | "select" | "date";
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

/**
 * Barra de filtros (§70): refletida na URL (compartilhável), aplica ao mudar
 * e permite salvar combinações favoritas por usuário.
 */
export function FilterBar({ fields, saved = [], extra }: { fields: FilterField[]; saved?: Array<{ id: string; name: string; query: string }>; extra?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(false);

  const apply = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("pagina");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const active = fields.some((f) => params.get(f.name));
  const query = params.toString();

  return (
    <div className="no-print mb-4 space-y-2">
      <div className={cn("flex flex-wrap items-end gap-2", pending && "opacity-70")}>
        {fields.map((f) =>
          f.type === "select" ? (
            <label key={f.name} className="min-w-40 flex-1 sm:flex-none">
              <span className="mb-1 block text-[12px] text-muted">{f.label}</span>
              <select
                className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                value={params.get(f.name) ?? ""}
                onChange={(e) => apply(f.name, e.target.value)}
              >
                <option value="">{f.placeholder ?? "Todos"}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label key={f.name} className={cn(f.type === "search" ? "min-w-56 flex-[2]" : "min-w-36 flex-1 sm:flex-none")}>
              <span className="mb-1 block text-[12px] text-muted">{f.label}</span>
              <input
                type={f.type === "date" ? "date" : "search"}
                defaultValue={params.get(f.name) ?? ""}
                placeholder={f.placeholder}
                className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                onKeyDown={(e) => {
                  if (e.key === "Enter") apply(f.name, (e.target as HTMLInputElement).value.trim());
                }}
                onBlur={(e) => {
                  if ((params.get(f.name) ?? "") !== e.target.value.trim()) apply(f.name, e.target.value.trim());
                }}
                onChange={(e) => {
                  if (f.type === "date") apply(f.name, e.target.value);
                }}
              />
            </label>
          ),
        )}
        {active && (
          <Link href={pathname} className="h-9 rounded-lg px-3 text-sm leading-9 text-muted hover:bg-surface-2 hover:text-text">
            Limpar
          </Link>
        )}
        {active && !saving && (
          <button type="button" onClick={() => setSaving(true)} className="h-9 rounded-lg px-3 text-sm text-primary hover:bg-primary-soft">
            Salvar filtro
          </button>
        )}
        {extra && <div className="ml-auto flex flex-wrap gap-2">{extra}</div>}
      </div>
      {saving && (
        <ActionForm action={saveFilterAction} onSuccess={() => setSaving(false)} className="flex flex-wrap items-end gap-2" successMessage={false}>
          <input type="hidden" name="screen" value={pathname} />
          <input type="hidden" name="query" value={query} />
          <Input name="name" label="Nome do filtro" placeholder="Ex.: Obras críticas de Campinas" wrapClassName="min-w-64" autoFocus />
          <SubmitButton size="sm" className="h-10">
            Salvar
          </SubmitButton>
          <button type="button" onClick={() => setSaving(false)} className="h-10 px-2 text-sm text-muted">
            Cancelar
          </button>
        </ActionForm>
      )}
      {saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-muted">Favoritos:</span>
          {saved.map((s) => (
            <span key={s.id} className={cn("inline-flex items-center rounded-full border text-[12px]", s.query === query ? "border-primary bg-primary-soft text-primary-strong" : "border-border bg-surface")}>
              <Link href={`${pathname}?${s.query}`} className="py-1 pl-2.5 pr-1">
                {s.name}
              </Link>
              <button
                type="button"
                aria-label={`Excluir filtro ${s.name}`}
                className="mr-1 rounded-full p-0.5 text-muted hover:bg-surface-2"
                onClick={() => start(async () => {
                  await deleteFilterAction(s.id);
                  router.refresh();
                })}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
