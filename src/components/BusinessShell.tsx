"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Card, LinkButton, Spinner } from "@/components/ui";
import { samePath } from "@/components/nav";
import { clsx } from "@/lib/clsx";
import { BRAND } from "@/lib/config";

// Mirrors AdminShell: the business screens are working surfaces on the legacy
// AppShell, like every provider screen past /pro itself, so there is one file
// per route and no `.kg`/desktop lane split.
const TABS = [
  ["/business", "Dispatch"],
  ["/business/team", "Team"],
  ["/business/earnings", "Earnings"],
];

/**
 * The gate is the `businesses` row being active — not `profile.role` — for
 * the same reason /pro/dashboard checks `providers.status` rather than
 * `role === "provider"`. That row is admin-write-only; the role column is
 * self-writable under `profiles_upd`.
 *
 * This is presentation, not security: every business write goes through a
 * SECURITY DEFINER RPC that re-checks the same thing, and RLS hides the rest.
 */
export function BusinessShell({ children }: { children: React.ReactNode }) {
  const { profile, businessStatus, loading } = useUser();
  const pathname = usePathname();

  if (loading) {
    return (
      <AppShell>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  if (profile?.role !== "business") {
    return (
      <AppShell>
        <Card className="text-center">
          <h1 className="text-lg font-bold">Business accounts only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A business account dispatches jobs to its own technicians.{" "}
            {BRAND.name} sets these up by hand — talk to us if you run a team.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <LinkButton href="/support" size="sm">
              Contact {BRAND.name}
            </LinkButton>
            <LinkButton href="/" variant="ghost" size="sm">
              Go home
            </LinkButton>
          </div>
        </Card>
      </AppShell>
    );
  }

  if (businessStatus !== "active") {
    return (
      <AppShell>
        <Card className="text-center">
          <h1 className="text-lg font-bold">Account suspended</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your business account is paused, so you can&apos;t take or assign new jobs, or reach
            the dispatch board. Jobs already with your technicians run to completion, and your
            technicians go back to taking work from the open pool in the meantime.
          </p>
          <div className="mt-4 flex justify-center">
            <LinkButton href="/support" size="sm">
              Contact support
            </LinkButton>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-extrabold tracking-tight">
        {profile.full_name ?? "Your business"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Dispatch console</p>
      <nav className="tabs mt-5 max-w-full overflow-x-auto">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className={clsx(samePath(pathname, href) && "on")}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </AppShell>
  );
}
