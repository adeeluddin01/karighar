"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resolveSignInDest } from "@/lib/roleHome";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";

// OAuth (Google) redirect target. In a static export there is no server, so we
// exchange the PKCE code for a session in the browser (the code verifier lives
// in this browser's storage from when signInWithOAuth was called).
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const next = params.get("next") || "/";
    const supabase = createClient();

    (async () => {
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          // Same role-aware landing as the password form.
          router.replace(
            data.user ? await resolveSignInDest(supabase, data.user.id, next) : next
          );
          return;
        }
      }
      setError(true);
      router.replace("/signin/?error=oauth");
    })();
  }, [router]);

  return (
    <AppShell width="narrow">
      <Spinner label={error ? "Sign-in failed — redirecting…" : "Signing you in…"} />
    </AppShell>
  );
}
