"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Card, Spinner } from "@/components/ui";
import { clsx } from "@/lib/clsx";

const TABS = [
  ["/admin", "Overview"],
  ["/admin/providers", "Providers"],
  ["/admin/jobs", "Jobs"],
  ["/admin/settlements", "Settlements"],
  ["/admin/disputes", "Disputes"],
  ["/admin/catalog", "Catalog"],
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useUser();
  const pathname = usePathname();

  if (loading) {
    return (
      <AppShell>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }
  if (profile?.role !== "admin") {
    return (
      <AppShell>
        <Card className="text-center">
          <h1 className="text-lg font-bold">Admins only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set your role to <code>admin</code> in Supabase:
            <br />
            <code className="mt-2 inline-block rounded bg-secondary px-2 py-1 text-xs">
              update profiles set role=&apos;admin&apos; where id=&apos;YOUR-USER-ID&apos;;
            </code>
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-extrabold tracking-tight">Business dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">Admin console</p>
      <nav className="tabs mt-5 max-w-full overflow-x-auto">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className={clsx(pathname === href && "on")}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </AppShell>
  );
}
