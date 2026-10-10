"use client";

import { Suspense } from "react";
import { Switch } from "@/components/Lanes";
import { AppShell } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";
import { AuthScreen } from "@/components/kg/AuthScreen";

export default function SignUpPage() {
  return (
    <Suspense>
      <Switch
        web={
          <AppShell width="narrow">
            <AuthForm mode="signup" />
          </AppShell>
        }
        phone={<AuthScreen mode="signup" />}
      />
    </Suspense>
  );
}
