"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Briefcase,
  Building2,
  Contact,
  Gauge,
  HardHat,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { isGroup, type NavEntry } from "./nav";

const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  gauge: Gauge,
  "hard-hat": HardHat,
  briefcase: Briefcase,
  building: Building2,
  users: Users,
  wallet: Wallet,
  package: Package,
  wrench: Wrench,
  contact: Contact,
  shield: Shield,
  sparkles: Sparkles,
  settings: Settings,
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ entries, pathname, onNavigate }: { entries: NavEntry[]; pathname: string; onNavigate?: () => void }) {
  // Item mais específico vence (ex.: /obras/medicoes não acende "Todas as obras")
  const allHrefs = entries.flatMap((e) => (isGroup(e) ? e.items.map((i) => i.href) : [e.href]));
  const best = allHrefs.filter((h) => isActive(pathname, h)).sort((a, b) => b.length - a.length)[0];

  return (
    <ul className="space-y-0.5">
      {entries.map((e) => {
        if (isGroup(e)) {
          const Icon = ICONS[e.icon];
          return (
            <li key={e.label} className="pt-3">
              <p className="flex items-center gap-2.5 px-3 pb-1 text-[12px] font-medium text-white/45">
                <Icon className="size-4" aria-hidden />
                {e.label}
              </p>
              <ul className="space-y-0.5">
                {e.items.map((i) => (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      aria-current={best === i.href ? "page" : undefined}
                      className={cn(
                        "block rounded-md py-1.5 pl-9 pr-3 text-[13.5px] transition-colors",
                        best === i.href ? "bg-white/12 font-medium text-white" : "text-white/72 hover:bg-white/6 hover:text-white",
                      )}
                    >
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        }
        const Icon = e.icon ? ICONS[e.icon] : LayoutDashboard;
        return (
          <li key={e.href}>
            <Link
              href={e.href}
              onClick={onNavigate}
              aria-current={best === e.href ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-[14px] transition-colors",
                best === e.href ? "bg-white/12 font-medium text-white" : "text-white/80 hover:bg-white/6 hover:text-white",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {e.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white p-1">
        <Image src="/brand/logo.png" alt="Revolution Imper" width={40} height={34} priority />
      </span>
      <span className="leading-tight">
        <span className="font-display block text-[17px] font-semibold tracking-wide text-white">Revolution Imper</span>
        <span className="block text-[12px] text-accent">Gestão 360</span>
      </span>
    </Link>
  );
}

export function Sidebar({ entries }: { entries: NavEntry[] }) {
  const pathname = usePathname();
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-abyss lg:flex">
      <div className="border-b border-white/8 py-4">
        <Brand />
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Menu principal">
        <NavList entries={entries} pathname={pathname} />
      </nav>
      <p className="border-t border-white/8 px-5 py-3 text-[11px] text-white/40">Controle total da sua operação.</p>
    </aside>
  );
}

export function MobileNav({ entries }: { entries: NavEntry[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-text hover:bg-surface-2 lg:hidden" aria-label="Abrir menu">
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-abyss/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-abyss shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 py-4 pr-3">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 text-white/70 hover:bg-white/10" aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              <NavList entries={entries} pathname={pathname} onNavigate={() => setOpen(false)} />
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
