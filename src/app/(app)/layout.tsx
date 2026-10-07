import { Header } from "@/components/shell/header";
import { isGroup, NAV, type NavEntry } from "@/components/shell/nav";
import { Sidebar } from "@/components/shell/sidebar";
import { Toaster } from "@/components/ui/toaster";
import { topProblems } from "@/domain/insights";
import { hasPermission } from "@/domain/permissions";
import { can, requireUser } from "@/server/auth/session";
import { loadOperationalSnapshot } from "@/server/services/insights";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const entries: NavEntry[] = NAV.flatMap((e): NavEntry[] => {
    if (isGroup(e)) {
      const items = e.items.filter((i) => hasPermission(user.permissions, i.permission));
      return items.length ? [{ ...e, items }] : [];
    }
    return hasPermission(user.permissions, e.permission) ? [e] : [];
  });

  let alertCount = 0;
  if (can(user, "dashboard:view")) {
    const snap = await loadOperationalSnapshot(user.companyId);
    alertCount = topProblems(snap.insights, 99).length;
  }

  return (
    <div className="min-h-dvh">
      <Sidebar entries={entries} />
      <div className="lg:pl-64">
        <Header user={{ name: user.name, roleName: user.roleName }} entries={entries} alertCount={alertCount} showAlerts={can(user, "dashboard:view")} />
        <Toaster />
        <main className="print-full mx-auto max-w-[1440px] px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
