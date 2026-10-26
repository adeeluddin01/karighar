"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { BusinessStatus, Profile, ProviderStatus } from "@/lib/types";

// Client hook: current auth user + their profile row, plus their provider
// verification status (null if they're not a provider at all). `loading`
// guards redirects.
//
// `providerStatus` matters beyond the pro pages: a customer who has started
// (or is mid-review for) a pro application still gets the default customer
// nav until they're actually `approved` — see roleOf() in components/nav.ts.
//
// `businessStatus` is the same idea for a dispatcher: the `businesses` row
// being `active`, not `role === "business"`, is what opens the business area.
export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [businessStatus, setBusinessStatus] = useState<BusinessStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      setUser(user);
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (!active) return;
        const p = data as Profile | null;
        setProfile(p);

        if (p?.role === "provider") {
          const { data: prov } = await supabase
            .from("providers")
            .select("status")
            .eq("profile_id", user.id)
            .maybeSingle();
          if (active) setProviderStatus((prov as { status: ProviderStatus } | null)?.status ?? null);
        } else if (active) {
          setProviderStatus(null);
        }

        if (p?.role === "business") {
          const { data: biz } = await supabase
            .from("businesses")
            .select("status")
            .eq("profile_id", user.id)
            .maybeSingle();
          if (active) setBusinessStatus((biz as { status: BusinessStatus } | null)?.status ?? null);
        } else if (active) {
          setBusinessStatus(null);
        }
      }
      if (active) setLoading(false);
    }
    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setProviderStatus(null);
        setBusinessStatus(null);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, profile, providerStatus, businessStatus, loading };
}

// Redirect to /signin if not authenticated (call inside a client page).
export function useRequireAuth(nextPath: string) {
  const { user, profile, providerStatus, businessStatus, loading } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/signin?next=${encodeURIComponent(nextPath)}`);
    }
  }, [loading, user, nextPath, router]);
  return { user, profile, providerStatus, businessStatus, loading };
}
