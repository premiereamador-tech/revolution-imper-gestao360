import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/server/auth/session";

/** Documentos para impressão / PDF com a identidade Revolution Imper (A4). */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="min-h-dvh bg-[#e9edf0] py-8 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 14mm 12mm; } @media print { .doc { box-shadow: none !important; width: auto !important; padding: 0 !important; } }`}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-2">
        <p className="text-sm text-muted">Use “Salvar como PDF” na janela de impressão para gerar o arquivo.</p>
        <PrintButton label="Imprimir ou salvar PDF" />
      </div>
      <article className="doc mx-auto w-[210mm] max-w-full bg-white px-[14mm] py-[14mm] text-[12.5px] leading-relaxed text-text shadow-xl">{children}</article>
    </div>
  );
}
