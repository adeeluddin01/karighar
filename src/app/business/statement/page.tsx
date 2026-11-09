"use client";

import { useRequireAuth } from "@/lib/useUser";
import { BusinessShell } from "@/components/BusinessShell";
import { LinkButton, PageHeader, Spinner } from "@/components/ui";
import { StatementScreen } from "@/components/StatementScreen";
import { BRAND } from "@/lib/config";

/**
 * The company's statement.
 *
 * The technician twin of /pro/statement, and split out of
 * /business/earnings for the same reason: the ledger was a card between the
 * totals and the dispatched-jobs list, and it had no natural length.
 *
 * The role gate is BusinessShell's, exactly as every other /business route.
 */
export default function BusinessStatementPage() {
  const { user, loading } = useRequireAuth("/business/statement");

  if (loading || !user) {
    return (
      <BusinessShell>
        <Spinner label="Loading…" />
      </BusinessShell>
    );
  }

  return (
    <BusinessShell>
      <PageHeader
        title="Your statement"
        subtitle="Every line recorded against your company."
        action={
          <LinkButton href="/business/earnings" variant="ghost" size="sm" icon="wallet">
            Earnings
          </LinkButton>
        }
      />
      <StatementScreen
        accountId={user.id}
        intro={
          <p className="text-sm text-muted-foreground">
            Your share of each dispatched job, the commission {BRAND.name} raised on it, and any
            cash you have settled — newest first.
          </p>
        }
      />
    </BusinessShell>
  );
}
