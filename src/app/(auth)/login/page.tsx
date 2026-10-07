import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/inicio");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-abyss lg:block">
        {/* Camadas de impermeabilização em corte: substrato, primer, manta, proteção */}
        <svg className="absolute inset-x-0 bottom-0 h-[46%] w-full" viewBox="0 0 800 360" preserveAspectRatio="none" aria-hidden>
          <rect y="250" width="800" height="110" fill="#1a4560" />
          <rect y="228" width="800" height="22" fill="#6f9e3a" />
          <rect y="214" width="800" height="14" fill="#3eb7c1" />
          <rect y="206" width="800" height="8" fill="#176ca0" />
          <path d="M0 206 C 160 194, 260 200, 400 190 S 640 182, 800 190 V206 H0Z" fill="#9fb0ba" />
        </svg>
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <span className="flex size-14 items-center justify-center rounded-xl bg-white p-1.5">
              <Image src="/brand/logo.png" alt="" width={52} height={45} priority />
            </span>
            <span className="text-white/70">Revolution Imper</span>
          </div>
          <div className="max-w-md pb-[40%]">
            <h1 className="font-display text-5xl font-semibold leading-[1.02] text-white">Gestão 360</h1>
            <p className="mt-3 text-lg text-white/75">Controle total da sua operação: da visita técnica à garantia, cada m², cada lote e cada real no mesmo lugar.</p>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image src="/brand/logo.png" alt="Revolution Imper" width={56} height={48} priority />
            <div>
              <p className="font-display text-xl font-semibold">Revolution Imper</p>
              <p className="text-sm text-muted">Gestão 360</p>
            </div>
          </div>
          <h2 className="font-display text-3xl font-semibold">Entrar</h2>
          <p className="mt-1 text-sm text-muted">Use o e-mail e a senha cadastrados pelo administrador.</p>
          <LoginForm next={next} />
        </div>
      </section>
    </main>
  );
}
