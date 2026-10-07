import Link from "next/link";
import { Bell, LogOut, Search } from "lucide-react";
import { logoutAction } from "@/app/(auth)/login/actions";
import { Avatar } from "@/components/ui/primitives";
import { MobileNav } from "./sidebar";
import type { NavEntry } from "./nav";

export function Header({ user, entries, alertCount, showAlerts }: { user: { name: string; roleName: string }; entries: NavEntry[]; alertCount: number; showAlerts: boolean }) {
  return (
    <header className="no-print sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <MobileNav entries={entries} />
        <form action="/busca" className="relative max-w-xl flex-1" role="search">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            name="q"
            type="search"
            placeholder="Buscar obra, cliente, funcionário, fornecedor, produto…"
            aria-label="Busca global"
            className="h-10 w-full rounded-lg border border-border bg-surface-2 pl-9 pr-3 text-sm placeholder:text-muted/80 focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </form>
        <div className="ml-auto flex items-center gap-1">
          {showAlerts && (
          <Link href="/alertas" className="relative rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label={`Central de alertas: ${alertCount} pendentes`}>
            <Bell className="size-5" />
            {alertCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </Link>
          )}
          <div className="ml-2 hidden items-center gap-2.5 sm:flex">
            <Avatar name={user.name} size={32} />
            <div className="leading-tight">
              <p className="text-[13px] font-medium text-text">{user.name}</p>
              <p className="text-[12px] text-muted">{user.roleName}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="ml-1 rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-text" aria-label="Sair" title="Sair">
              <LogOut className="size-5" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
