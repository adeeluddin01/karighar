"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { LinkButton, PageHeader, Spinner } from "@/components/ui";
import { StatementScreen } from "@/components/StatementScreen";
import { BRAND } from "@/lib/config";

/**
 * The technician's statement, on its own.
 *
 * Was a card at the bottom of /pro/history, under the wallet totals and
 * above the past-jobs list. A ledger has no natural length, so on a busy
 * account it pushed everything else off the screen; /pro/history now links
 * here instead.
 */
export default function ProviderStatementPage() {
  const { user, profile, loading } = useRequireAuth("/pro/statement");
  const router = useRouter();

  // Same guard as the rest of the pro area: a signed-in non-provider opening
  // the URL gets their own home rather than an empty statement.
  useEffect(() => {
    if (!loading && profile && profile.role !== "provider") {
      router.replace(
        profile.role === "customer" ? "/" : profile.role === "business" ? "/business" : "/admin"
      );
    }
  }, [loading, profile, router]);

  if (!loading && profile && profile.role !== "provider") return null;

  if (loading || !user) {
    return (
      <AppShell>
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Your statement"
        subtitle="Every line recorded against your account."
        action={
          <LinkButton href="/pro/history" variant="ghost" size="sm" icon="history">
            Earnings &amp; history
          </LinkButton>
        }
      />
      <StatementScreen
        accountId={user.id}
        intro={
          <p className="text-sm text-muted-foreground">
            What you earned on each job, the commission {BRAND.name} raised on it, and any cash
            you have settled — newest first.
          </p>
        }
      />
    </AppShell>
  );
}
