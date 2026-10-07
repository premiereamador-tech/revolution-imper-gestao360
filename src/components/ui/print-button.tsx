"use client";

import { buttonClass } from "./primitives";

/** Imprime a tela atual (o CSS de impressão esconde menu e botões). Use "Salvar como PDF" no diálogo para gerar PDF. */
export function PrintButton({ label = "Imprimir / PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary", "md")}>
      {label}
    </button>
  );
}
