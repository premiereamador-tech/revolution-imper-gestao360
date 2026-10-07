import Image from "next/image";
import type { ReactNode } from "react";

export function DocHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-6 border-b-[3px] border-primary pb-4">
      <div className="flex items-center gap-4">
        <Image src="/brand/logo.png" alt="Revolution Imper" width={84} height={72} priority />
        <div>
          <p className="font-display text-2xl font-semibold leading-tight">{title}</p>
          {subtitle && <div className="text-[12px] text-muted">{subtitle}</div>}
        </div>
      </div>
      <div className="text-right text-[11px] leading-snug text-muted">
        <p className="font-semibold text-text">Revolution Imper Impermeabilizações</p>
        {right}
      </div>
    </header>
  );
}

export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 break-inside-avoid">
      <h2 className="font-display mb-2 border-b border-border pb-1 text-[16px] font-semibold text-primary-strong">{title}</h2>
      {children}
    </section>
  );
}

export function Signature({ label, name }: { label: string; name?: string | null }) {
  return (
    <div className="pt-12 text-center">
      <div className="mx-auto w-64 border-t border-text pt-1.5 text-[12px]">
        {name && <p className="font-medium">{name}</p>}
        <p className="text-muted">{label}</p>
      </div>
    </div>
  );
}
