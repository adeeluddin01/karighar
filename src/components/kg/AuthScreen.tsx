"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { resolveSignInDest } from "@/lib/roleHome";
import { Screen, Scroll, TopBar } from "@/components/kg/Screen";
import { KAuthForm } from "@/components/kg/AuthForm";
import { KIcon } from "@/components/kg/icons";
import { Well } from "@/components/kg/parts";
import { BRAND } from "@/lib/config";

/** The phone lane of /signin and /signup. */
export function AuthScreen({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";
  const asProvider = search.get("role") === "provider";
  const dest = asProvider ? "/pro/onboarding" : next;

  return (
    <Screen>
      <TopBar back="/" />
      <Scroll underTop pad="plain">
        <div className="rate-head">
          <Well icon={asProvider ? "wrench" : "shield"} size="lg" />
          <h2>
            {mode === "signup"
              ? asProvider
                ? `Join ${BRAND.name} as a pro`
                : "Create your account"
              : "Welcome back"}
          </h2>
          <small>
            {mode === "signup"
              ? asProvider
                ? "CNIC and a selfie to verify. Approval usually takes 1–2 days."
                : "It takes less than a minute, and you only pay after a job is done."
              : `Sign in to book and track services in ${BRAND.city}.`}
          </small>
        </div>

        <KAuthForm
          mode={mode}
          asProvider={asProvider}
          onGoogleRedirect={() => dest}
          onDone={async () => {
            // A provider signing in belongs on their dashboard, not the
            // customer Home — resolve that here so they don't bounce.
            const supabase = createClient();
            const {
              data: { user },
            } = await supabase.auth.getUser();
            router.push(
              asProvider || !user ? dest : await resolveSignInDest(supabase, user.id, dest)
            );
            router.refresh();
          }}
        />

        <small style={{ textAlign: "center", marginTop: 4 }}>
          {mode === "signup" ? "Already have an account? " : `New to ${BRAND.name}? `}
          <Link
            className="link"
            href={`/${mode === "signup" ? "signin" : "signup"}?next=${encodeURIComponent(next)}${
              asProvider ? "&role=provider" : ""
            }`}
          >
            {mode === "signup" ? "Sign in" : "Create an account"}
            <KIcon name="chev-r" xs />
          </Link>
        </small>

        <div className="note">
          <KIcon name="shield" />
          <p>
            <b>Every pro is CNIC-verified.</b> Fixed Karachi prices, live tracking, and you pay cash
            only once the work is done.
          </p>
        </div>

        <small style={{ textAlign: "center" }}>
          By continuing you agree to our{" "}
          <Link className="link" href="/terms">
            Terms
          </Link>{" "}
          and{" "}
          <Link className="link" href="/privacy">
            Privacy policy
          </Link>
          .
        </small>
      </Scroll>
    </Screen>
  );
}
