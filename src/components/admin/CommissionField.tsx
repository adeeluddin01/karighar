"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Button, Input, Pill } from "@/components/ui";
import { fromPercent, toPercent, validatePercent } from "@/lib/commission";

/**
 * One account's commission rate, on the Providers and Businesses tabs.
 *
 * Shared between both because the semantics have to match exactly: blank
 * means "follow the platform default" rather than "charge nothing", and
 * `set_account_commission` (patch_v24) works out for itself which table the
 * id belongs to. Written as a percentage because that is how an admin
 * thinks; `fromPercent` is what keeps the stored fraction honest.
 *
 * A change applies to work assigned from now on. The rate is stamped onto a
 * job when its provider is set and frozen there, so nothing already agreed
 * is re-priced.
 *
 * Note the asymmetry: the platform has a rate PER JOB TYPE, but an account
 * override is a single number that replaces both. That is deliberate — "this
 * company pays us 12%" is the deal people actually strike — so the default
 * is shown as the pair it is rather than pretending there is only one.
 */
export function CommissionField({
  profileId,
  value,
  defaults,
  onSaved,
}: {
  profileId: string;
  /** The account's own override, or null if it follows the platform. */
  value: number | null;
  /** Both platform rates, since one override replaces both. */
  defaults: { fixed: number; custom: number };
  onSaved: (rate: number | null) => void;
}) {
  const toast = useToast();
  const [text, setText] = useState(toPercent(value));
  const [busy, setBusy] = useState(false);

  // Null is "follows the platform"; 0 is a real deal. `=== null` rather than
  // a falsy check is what keeps those apart.
  const custom = value !== null;
  const parsed = fromPercent(text);
  const dirty = parsed !== value;

  async function save(next: number | null) {
    setBusy(true);
    const { error } = await createClient().rpc("set_account_commission", {
      p_profile: profileId,
      p_rate: next,
    });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setText(toPercent(next));
    onSaved(next);
    toast(
      next === null
        ? "Back to the default commission."
        : `Commission set to ${toPercent(next)}%.`,
      "success"
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground">Commission</span>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={toPercent(defaults.fixed)}
        inputMode="decimal"
        suffix="%"
        aria-label="Commission percentage"
        className="w-28"
      />
      <Button
        size="sm"
        disabled={busy || !dirty}
        onClick={() => {
          const bad = validatePercent(text);
          if (bad) {
            toast(bad, "error");
            return;
          }
          void save(parsed);
        }}
      >
        {busy ? "Saving…" : "Save"}
      </Button>
      {custom ? (
        <>
          <Pill tone="warn">own rate</Pill>
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            disabled={busy}
            onClick={() => void save(null)}
          >
            Use default
          </button>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">
          following the default — {toPercent(defaults.fixed)}% fixed,{" "}
          {toPercent(defaults.custom)}% on quote
        </span>
      )}
    </div>
  );
}
