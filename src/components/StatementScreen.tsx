"use client";

import { useMemo, useState } from "react";
import { Card, Chip, Field, Input } from "@/components/ui";
import { InfoTip } from "@/components/InfoTip";
import { LedgerHistory } from "@/components/LedgerHistory";
import {
  RANGE_PRESETS,
  customRange,
  describeRange,
  resolveRange,
  type RangeKey,
} from "@/lib/dateRange";

/* ============================================================
   A statement, with a window on it.

   Split out of /pro/history and /business/earnings: the line list has no
   natural length, and on an account with a year of work it buried the
   summary, the job list and everything else on those screens. It is its own
   destination now, and those screens link to it.

   Shared by both because a technician's statement and a company's are the
   same document read by different people — only the heading differs.
   ============================================================ */
export function StatementScreen({
  accountId,
  /** Shown under the range chips, e.g. "Everything KARIGHAR has recorded…". */
  intro,
}: {
  accountId: string;
  intro: React.ReactNode;
}) {
  // Last 30 days rather than all time: the common question is "what have I
  // done lately", and it keeps the first paint short on a long account.
  const [key, setKey] = useState<RangeKey>("last30");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");

  const range = useMemo(
    () => (key === "custom" ? customRange(fromDay, toDay) : resolveRange(key)),
    [key, fromDay, toDay]
  );

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_PRESETS.map((p) => (
            <Chip key={p.key} active={key === p.key} onClick={() => setKey(p.key)}>
              {p.label}
            </Chip>
          ))}
          <Chip active={key === "custom"} onClick={() => setKey("custom")}>
            Custom
          </Chip>
        </div>

        {key === "custom" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="From">
              <Input
                type="date"
                value={fromDay}
                max={toDay || undefined}
                onChange={(e) => setFromDay(e.target.value)}
                aria-label="From date"
              />
            </Field>
            <Field label="To" hint="The whole of this day is included.">
              <Input
                type="date"
                value={toDay}
                min={fromDay || undefined}
                onChange={(e) => setToDay(e.target.value)}
                aria-label="To date"
              />
            </Field>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          Showing <strong>{describeRange(range)}</strong>. The totals below cover your whole
          account, not just this period
          <InfoTip label="Why the totals ignore the date range">
            What you still owe is a fact about the account, not about a window. If it changed
            whenever you picked a month, it would look like a smaller debt than it is.
          </InfoTip>
        </p>
        {/* Folded into the controls rather than given a card of its own —
            this screen exists to stop the statement eating the page, so it
            should not open by spending a card on one sentence. */}
        <div className="mt-3 border-t border-border pt-3">{intro}</div>
      </Card>

      <div className="mt-4">
        <Card>
          <LedgerHistory accountId={accountId} range={range} />
        </Card>
      </div>
    </>
  );
}
