"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_COMMISSION,
  PLATFORM_RATE_COLUMNS,
  type CommissionScope,
  type PlatformSettings,
  type RatePair,
  ratePairOf,
} from "@/lib/commission";

/**
 * The platform's current commission rates for one kind of account.
 *
 * Starts at the compiled-in defaults and swaps in the real row once it
 * arrives, so a screen can render the number immediately instead of
 * flashing a blank where a percentage belongs.
 *
 * STAYS ON THE DEFAULTS FOR A LOGGED-OUT VISITOR, ON PURPOSE. The
 * `settings_read` policy is `to authenticated`, so an anonymous read of
 * `platform_settings` returns nothing — and /pro, which is the main caller,
 * is a page guests are meant to read. The fallback is the honest answer
 * there: it matches the column defaults, which is what a brand-new
 * installation charges. An admin who has moved the rates will see the real
 * ones as soon as they are signed in, and so will every applicant who has
 * made an account.
 *
 * `noSettings` says the row could not be read, so a caller that needs to
 * distinguish "the platform charges 20%" from "we could not ask" can.
 */
export function usePlatformRates(scope: CommissionScope): {
  rates: RatePair;
  loading: boolean;
  noSettings: boolean;
} {
  const [rates, setRates] = useState<RatePair>(DEFAULT_COMMISSION[scope]);
  const [loading, setLoading] = useState(true);
  const [noSettings, setNoSettings] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const { data, error } = await createClient()
        .from("platform_settings")
        .select(PLATFORM_RATE_COLUMNS)
        .maybeSingle();
      if (!live) return;
      const row = (data as PlatformSettings | null) ?? null;
      setNoSettings(!!error || !row);
      setRates(ratePairOf(row, scope));
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [scope]);

  return { rates, loading, noSettings };
}
