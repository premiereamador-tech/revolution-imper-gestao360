import Image from "next/image";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <Image src="/brand/logo.png" alt="Revolution Imper" width={80} height={69} />
      <h1 className="font-display text-3xl font-semibold">Sem conexão</h1>
      <p className="max-w-sm text-sm text-muted">
        Esta tela ainda não foi aberta neste aparelho. Diários, ponto e ocorrências registrados em &quot;Meu dia em campo&quot; ficam salvos no celular e são
        enviados quando a internet voltar.
      </p>
      <a href="/campo" className="mt-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white">
        Abrir meu dia em campo
      </a>
    </main>
  );
}
