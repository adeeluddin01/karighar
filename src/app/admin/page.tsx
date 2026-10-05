"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { LinkButton, Stat } from "@/components/ui";
import type { IconName } from "@/components/Icon";

export default function AdminOverview() {
  const [stats, setStats] = useState({ pendingPros: 0, openJobs: 0, activeJobs: 0, totalJobs: 0 });

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [pending, open, active, total] = await Promise.all([
        supabase
          .from("providers")
          .select("profile_id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .in("status", ["created", "bidding"]),
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .in("status", ["assigned", "en_route", "arrived", "in_progress", "completed"]),
        supabase.from("jobs").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        pendingPros: pending.count ?? 0,
        openJobs: open.count ?? 0,
        activeJobs: active.count ?? 0,
        totalJobs: total.count ?? 0,
      });
    })();
  }, []);

  const tiles: [string, number, IconName][] = [
    ["Pending verifications", stats.pendingPros, "users"],
    ["Open jobs", stats.openJobs, "briefcase"],
    ["Active jobs", stats.activeJobs, "clock"],
    ["Total jobs", stats.totalJobs, "trend"],
  ];

  return (
    <AdminShell>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(([label, value, icon]) => (
          <Stat key={label} label={label} value={value} icon={icon} />
        ))}
      </div>

      <div className="surface mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-base font-bold">Where to next?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Verify providers, monitor jobs, settle commissions, and manage the price catalog.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/admin/providers" size="sm" icon="users">
            Verify providers
          </LinkButton>
          <LinkButton href="/admin/jobs" variant="ghost" size="sm" icon="briefcase">
            Jobs
          </LinkButton>
          <LinkButton href="/admin/settlements" variant="ghost" size="sm" icon="wallet">
            Settlements
          </LinkButton>
        </div>
      </div>
    </AdminShell>
  );
}
