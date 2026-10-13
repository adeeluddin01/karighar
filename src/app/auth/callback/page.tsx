"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { resolveSignInDest } from "@/lib/roleHome";
import { authErrorMessage } from "@/lib/authActions";
import { withSlash } from "@/lib/siteUrl";
import { AppShell } from "@/components/AppShell";
import { Card, Spinner } from "@/components/ui";

/* ============================================================
   Where an email-confirmation link (and later a Google redirect) lands.

   A client page, not a route handler: a static export has no server to
   exchange the code on.

   The subtlety that made this page report failure on *success*:
   `createBrowserClient` forces `flowType: "pkce"` and leaves
   `detectSessionInUrl` on, so the SDK's own initialize() spots the `?code=`,
   exchanges it, stores the session and strips the param. A manual
   `exchangeCodeForSession` afterwards is operating on a spent code — and it
   awaits that same initialize() first, so it *always* lost the race. The old
   code then redirected to /signin/?error=oauth even though the user was
   signed in.

   So: ask whether we have a session first, and only fall back to exchanging
   anything if we don't.
   ============================================================ */

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Read the URL before anything else touches it — initialize() rewrites it.
    const url = new URL(window.location.href);
    const query = url.searchParams;
    // Implicit-flow and some error responses come back in the fragment.
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const param = (k: string) => query.get(k) ?? hash.get(k);

    const next = withSlash(param("next") || "/");
    const supabase = createClient();
    let active = true;

    function fail(code: string) {
      if (!active) return;
      setMessage(authErrorMessage(code));
      // Leave the message up briefly; bouncing instantly reads as "nothing
      // happened", which is how this bug was originally reported.
      setTimeout(() => {
        if (active) router.replace(`/signin/?error=${encodeURIComponent(code)}`);
      }, 1500);
    }

    async function succeed(userId: string | undefined) {
      if (!active) return;
      router.replace(userId ? await resolveSignInDest(supabase, userId, next) : next);
    }

    (async () => {
      // 1. The provider said no, or the link is stale.
      const errCode = param("error_code") ?? param("error");
      if (errCode) {
        const desc = param("error_description") ?? "";
        fail(
          /expired|invalid/i.test(`${errCode} ${desc}`)
            ? "link_expired"
            : errCode === "access_denied"
              ? "oauth_denied"
              : "oauth"
        );
        return;
      }

      // 2. The common path: the SDK already turned the code into a session.
      //    getSession() awaits initialize(), so this also waits out the race.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        await succeed(session.user.id);
        return;
      }

      // 3. A confirmation/recovery link in the older token_hash form.
      const tokenHash = param("token_hash");
      const type = param("type");
      if (tokenHash && type) {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
        if (!error && data.session) {
          await succeed(data.session.user.id);
          return;
        }
        fail(/expired/i.test(error?.message ?? "") ? "link_expired" : "oauth");
        return;
      }

      // 4. A code the SDK didn't consume. Worth one explicit attempt.
      const code = param("code");
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.session) {
          await succeed(data.session.user.id);
          return;
        }
        // PKCE keeps its verifier in the browser that *started* the flow, so
        // opening the link on another device or browser can never work. Say
        // that, rather than implying the account is broken.
        fail("wrong_browser");
        return;
      }

      // 5. Nothing usable in the URL at all.
      fail("no_credentials");
    })();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <AppShell width="narrow">
      {message ? (
        <Card className="bg-warning-light">
          <p className="text-sm text-warning-foreground">{message}</p>
          <p className="mt-2 text-xs text-muted-foreground">Taking you to sign in…</p>
        </Card>
      ) : (
        <Spinner label="Signing you in…" />
      )}
    </AppShell>
  );
}
