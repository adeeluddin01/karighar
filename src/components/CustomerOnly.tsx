"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/useUser";

// Booking is a customer flow. The sidebar and phone tabs already hide it
// from providers, but hiding a link is not a block: a provider opening
// /book (or /book/service/*, /book/custom/*) directly could still book
// themselves as their own customer. This guard sends signed-in providers
// to their dashboard instead. Guests keep browsing — they hit sign-in at
// checkout — and every other role is untouched.
export function CustomerOnly({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useUser();
  const router = useRouter();
  const isProvider = !!user && profile?.role === "provider";

  useEffect(() => {
    if (!loading && isProvider) router.replace("/pro/dashboard");
  }, [loading, isProvider, router]);

  if (loading || isProvider) return null;
  return <>{children}</>;
}
