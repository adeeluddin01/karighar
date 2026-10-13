"use client";

import Link from "next/link";
import { Card, LinkButton } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { proPromo } from "@/components/nav";
import { useUser } from "@/lib/useUser";

/**
 * The recruitment promo on the web Home.
 *
 * A client component because `src/app/desktop.tsx` is a *server* component and
 * cannot call useUser(). Copy comes from proPromo(), shared with the phone lane.
 *
 * While the session resolves we render the guest copy rather than nothing, so
 * the prerendered HTML keeps the link for crawlers — the page used to carry a
 * plain "Join as a technician" anchor here.
 */
export function BecomeProCard() {
  const { profile, providerStatus, loading } = useUser();
  const promo = loading ? proPromo(null, null) : proPromo(profile?.role, providerStatus);

  if (!promo) return null;

  return (
    <Card className="mt-8 bg-primary-light">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {promo.eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-extrabold tracking-tight text-accent-foreground">
            {promo.title}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{promo.body}</p>
        </div>
        <LinkButton href={promo.href} className="shrink-0">
          {promo.cta}
          <Icon name="chevron" size="sm" />
        </LinkButton>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Already applied?{" "}
        <Link href="/profile" className="font-semibold text-primary">
          Check your verification status
        </Link>
      </p>
    </Card>
  );
}
