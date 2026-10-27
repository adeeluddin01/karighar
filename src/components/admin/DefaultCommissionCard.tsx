"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input, Pill } from "@/components/ui";
import {
  fromPercent,
  toPercent,
  validatePercent,
  type CommissionScope,
  type RatePair,
} from "@/lib/commission";

const COPY: Record<CommissionScope, { title: string; blurb: string; who: string }> = {
  provider: {
    title: "Default technician commission",
    blurb:
      "What Karighar takes from a job done by an independent technician, as a percentage of the price the customer pays. A technician with their own rate set below overrides this.",
    who: "technician",
  },
  business: {
    title: "Default company commission",
    blurb:
      "What Karighar takes from a job dispatched by a company. The company is billed, not its technician — so this is the rate that applies to dispatched work, whatever the technician's own rate is. A company with its own rate set below overrides it.",
    who: "company",
  },
};

/**
 * The platform default for one kind of account, shown on that kind's own
 * admin tab rather than on a separate settings screen — so the number and
 * the accounts it governs are read together.
 *
 * Each scope writes only its own pair: `set_platform_commission` takes the
 * scope explicitly, so saving on the Providers tab cannot quietly rewrite
 * what companies are charged.
 *
 * Changing a default affects work assigned from now on. A job's rate is
 * stamped when its provider is set and frozen there, so nothing already
 * agreed is re-priced.
 */
export function DefaultCommissionCard({
  scope,
  value,
  missing,
  updatedAt,
  onSaved,
}: {
  scope: CommissionScope;
  value: RatePair;
  /** True when patch_v24 hasn't been applied, so the form can never save. */
  missing?: boolean;
  updatedAt?: string | null;
  onSaved: (next: RatePair) => void;
}) {
  const toast = useToast();
  const copy = COPY[scope];
  const [fixed, setFixed] = useState(toPercent(value.fixed));
  const [custom, setCustom] = useState(toPercent(value.custom));
  const [busy, setBusy] = useState(false);

  const parsedFixed = fromPercent(fixed);
  const parsedCustom = fromPercent(custom);
  const dirty = parsedFixed !== value.fixed || parsedCustom !== value.custom;

  async function save() {
    for (const [label, text] of [
      ["Fixed-price", fixed],
      ["On-quote", custom],
    ] as const) {
      const bad = validatePercent(text, { required: true });
      if (bad) {
        toast(`${label}: ${bad}`, "error");
        return;
      }
    }
    if (parsedFixed === null || parsedCustom === null) return;

    setBusy(true);
    const { error } = await createClient().rpc("set_platform_commission", {
      p_scope: scope,
      p_fixed: parsedFixed,
      p_custom: parsedCustom,
    });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    onSaved({ fixed: parsedFixed, custom: parsedCustom });
    toast(`Default ${copy.who} commission updated.`, "success");
  }

  return (
    <Card>
      <h2 className="text-lg font-bold tracking-tight">{copy.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.blurb}</p>

      {missing && (
        <p className="mt-3 text-sm font-semibold text-amber-600 dark:text-amber-500">
          Commission settings aren&apos;t in this database yet. Run{" "}
          <code>supabase/patch_v24_commission_rates.sql</code>, then reload. Until then every
          job uses the built-in 20% / 15%.
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Fixed-price jobs" hint="Booked from the catalogue at a set price.">
          <Input
            value={fixed}
            onChange={(e) => setFixed(e.target.value)}
            inputMode="decimal"
            suffix="%"
            aria-label={`Default ${copy.who} commission on fixed-price jobs`}
          />
        </Field>
        <Field label="On-quote jobs" hint="Priced by the pro once they are on site.">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            inputMode="decimal"
            suffix="%"
            aria-label={`Default ${copy.who} commission on on-quote jobs`}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={busy || missing || !dirty} onClick={() => void save()}>
          {busy ? "Saving…" : "Save default"}
        </Button>
        {!dirty && !busy && !missing && (
          <Pill tone="ok" icon="check">
            Up to date
          </Pill>
        )}
        <span className="text-xs text-muted-foreground">
          Applies to work assigned from now on — jobs already booked keep the rate they were
          stamped with.
          {updatedAt ? ` Last changed ${new Date(updatedAt).toLocaleDateString("en-PK")}.` : ""}
        </span>
      </div>
    </Card>
  );
}
