"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, LinkButton } from "@/components/ui";
import { Icon } from "@/components/Icon";
import type { HousePromo as Promo } from "@/lib/types";

/**
 * Karighar's own promo banner, for whichever audience is asking.
 *
 * The copy comes from the `house_promos` table rather than from this file:
 * the app is a static export, so hard-coded marketing text would need a
 * rebuild and redeploy every time it changed.
 *
 * RLS already restricts the table to rows that are active and inside their
 * start/end window, so this just takes the highest-priority one. Renders
 * nothing when there is none — including on a database where the table does
 * not exist yet, which keeps the dashboard working ahead of patch_v14.
 */
export function HousePromo({ audience }: { audience: "provider" | "customer" }) {
  const [promo, setPromo] = useState<Promo | null>(null);

  useEffect(() => {
    let active = true;
    createClient()
      .from("house_promos")
      .select("*")
      .in("audience", [audience, "all"])
      .order("priority", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setPromo((data as Promo | null) ?? null);
      });
    return () => {
      active = false;
    };
  }, [audience]);

  if (!promo) return null;

  return (
    <Card className="mt-6 border-primary/30 bg-primary-light">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          {promo.eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {promo.eyebrow}
            </p>
          )}
          <h2 className="mt-1 text-lg font-extrabold tracking-tight text-accent-foreground">
            {promo.title}
          </h2>
          {promo.body && (
            <p className="mt-1 max-w-prose text-sm text-muted-foreground">{promo.body}</p>
          )}
        </div>
        {promo.href && promo.cta_label && (
          <LinkButton href={promo.href} size="sm" className="shrink-0">
            {promo.cta_label}
            <Icon name="chevron" size="sm" />
          </LinkButton>
        )}
      </div>
    </Card>
  );
}
