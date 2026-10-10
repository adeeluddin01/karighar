"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Icon, type IconName } from "@/components/Icon";
import {
  Avatar,
  Button,
  Card,
  Field,
  Input,
  KV,
  Pill,
  Rating,
  Spinner,
} from "@/components/ui";
import type { Provider } from "@/lib/types";

export default function ProfilePage() {
  const { user, profile, loading } = useRequireAuth("/profile");
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
    }
    if (user && profile?.role === "provider") {
      createClient()
        .from("providers")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle()
        .then(({ data }) => setProvider(data as Provider | null));
    }
  }, [profile, user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setSaved(false);
    await createClient().from("profiles").update({ full_name: fullName, phone }).eq("id", user.id);
    setBusy(false);
    setSaved(true);
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading || !user) {
    return (
      <AppShell width="narrow">
        <Spinner label="Loading…" />
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <div className="flex items-center gap-4">
        <Avatar name={fullName || user.email} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">
            {fullName || "Your profile"}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm capitalize text-muted-foreground">
            {profile?.role}
            {provider && (
              <Pill tone={provider.status === "approved" ? "ok" : "warn"}>{provider.status}</Pill>
            )}
          </p>
        </div>
      </div>

      {provider?.status === "approved" && (
        <Card className="mt-4">
          <KV label="Rating">
            <Rating value={provider.rating_avg} />
          </KV>
          <KV label="Jobs completed">{provider.jobs_completed}</KV>
        </Card>
      )}

      <form onSubmit={save} className="mt-6 space-y-4">
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Phone">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
          />
        </Field>
        <Field label="Email" hint="Email can't be changed here.">
          <Input className="opacity-60" value={user.email ?? ""} disabled />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
          {saved && (
            <Pill tone="ok" icon="check">
              Saved
            </Pill>
          )}
        </div>
      </form>

      <Card padded={false} className="mt-8 overflow-hidden">
        {provider ? (
          provider.status === "approved" ? (
            <Row href="/pro/services" icon="wrench">
              Manage my services &amp; areas
            </Row>
          ) : (
            <Row href="/pro/onboarding" icon="shield">
              View my verification details
            </Row>
          )
        ) : (
          <Row href="/pro" icon="briefcase">
            Become a service provider
          </Row>
        )}
        <Row href="/settings" icon="settings">
          Settings
        </Row>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 p-4 text-left font-semibold text-destructive hover:bg-destructive-light"
        >
          <Icon name="logout" size="sm" /> Sign out
        </button>
      </Card>
    </AppShell>
  );
}

function Row({
  href,
  icon,
  children,
}: {
  href: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-border p-4 font-medium hover:bg-secondary"
    >
      <Icon name={icon} size="sm" className="text-muted-foreground" />
      <span className="flex-1">{children}</span>
      <Icon name="chevron" size="sm" className="text-muted-foreground" />
    </Link>
  );
}
