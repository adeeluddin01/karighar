"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/useUser";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { NAV, isActive, roleOf } from "@/components/nav";
import { BRAND } from "@/lib/config";
import { clsx } from "@/lib/clsx";

// Desktop-only sticky sidebar (the prototype's `aside.side`). Hidden below md,
// where AppHeader + BottomNav take over.
export function Sidebar() {
  const { user, profile, providerStatus, loading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  const role = roleOf(!!user, profile?.role, providerStatus);
  const links = NAV[role];

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="surface sticky top-5 hidden h-[calc(100vh-2.5rem)] w-60 shrink-0 flex-col p-4 md:flex">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-2 pt-2">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
          K
        </span>
        <span className="text-lg font-bold tracking-tight">{BRAND.name}</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition",
              isActive(pathname, l.href)
                ? "bg-primary-light font-semibold text-accent-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Icon name={l.icon} />
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="rounded-2xl bg-primary-light p-4">
          <p className="text-sm font-semibold text-accent-foreground">Need help?</p>
          <p className="mt-1 text-xs text-muted-foreground">Call us 9am – 9pm, every day.</p>
          <Link href="/support" className="btn-primary btn-sm mt-3 w-full">
            <Icon name="phone" size="sm" /> Contact support
          </Link>
        </div>

        {loading ? (
          <div className="h-12 animate-pulse rounded-xl bg-secondary" />
        ) : user ? (
          <div className="border-t border-border pt-3">
            <Link
              href="/profile"
              className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-secondary"
            >
              <Avatar name={profile?.full_name || user.email} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {profile?.full_name ?? "Account"}
                </span>
                <span className="block text-xs capitalize text-muted-foreground">{role}</span>
              </span>
            </Link>
            <div className="mt-1 flex gap-1">
              <Link
                href="/settings"
                className="flex flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <Icon name="settings" size="sm" /> Settings
              </Link>
              <button
                onClick={signOut}
                className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-destructive hover:bg-destructive-light"
              >
                <Icon name="logout" size="sm" /> Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <Link href="/signup" className="btn-primary btn-sm w-full">
              Create account
            </Link>
            <Link href="/signin" className="btn-ghost btn-sm w-full">
              Sign in
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
