"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./primitives";

/**
 * Modal acessível (overlay próprio, renderizado no <body>): Esc fecha, foco vai para
 * o primeiro campo e volta ao botão ao fechar. Em telas pequenas abre como folha inferior.
 * O conteúdo recebe `close` para fechar após uma ação concluída.
 */
export function Modal({
  trigger,
  title,
  description,
  children,
  variant = "primary",
  size = "md",
  triggerClassName,
  wide,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: (close: () => void) => ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  triggerClassName?: string;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button[type=submit]");
    first?.focus();
    const trig = triggerRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      trig?.focus();
    };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} type="button" className={buttonClass(variant, size, triggerClassName)} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {trigger}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <div className="absolute inset-0 bg-abyss/55" onClick={() => setOpen(false)} aria-hidden />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className={cn("relative max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-surface text-left text-text shadow-2xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
            >
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-5 py-4">
                <div>
                  <h2 id={titleId} className="font-semibold">
                    {title}
                  </h2>
                  {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:bg-surface-2" aria-label="Fechar">
                  <X className="size-5" />
                </button>
              </div>
              <div className="px-5 py-4">{children(() => setOpen(false))}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
