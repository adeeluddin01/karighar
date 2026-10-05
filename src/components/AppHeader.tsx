"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/useUser";
import { NotificationBell } from "@/components/NotificationBell";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { roleOf } from "@/components/nav";
import { BRAND } from "@/lib/config";

// Mobile-only top bar. On md+ the Sidebar carries the logo, nav and account block,
// so this collapses to nothing; navigation lives in BottomNav on small screens.
export function AppHeader() {
  const { user, profile, providerStatus, loading } = useUser();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const role = roleOf(!!user, profile?.role, providerStatus);

  async function signOut() {
    setMenuOpen(false);
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur-md md:hidden">
      <div className="flex items-center justify-between px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
            K
          </span>
          <span className="text-base font-bold tracking-tight">{BRAND.name}</span>
        </Link>

        <div className="flex items-center gap-1">
          {loading ? (
            <div className="h-8 w-16 animate-pulse rounded-lg bg-secondary" />
          ) : user ? (
            <>
              <NotificationBell userId={user.id} />
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-1 rounded-full border border-border py-1 pl-1 pr-2"
                  aria-label="Account"
                >
                  <Avatar name={profile?.full_name || user.email} size="sm" />
                  <Icon name="chevron" size="sm" className="rotate-90 text-muted-foreground" />
                </button>
                {menuOpen && (
                  <>
                    <button
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setMenuOpen(false)}
                      aria-hidden
                    />
                    <div className="surface absolute right-0 z-20 mt-2 w-52 overflow-hidden py-1">
                      <div className="border-b border-border px-4 py-2">
                        <p className="truncate text-sm font-semibold">
                          {profile?.full_name ?? "Account"}
                        </p>
                        <p className="truncate text-xs capitalize text-muted-foreground">{role}</p>
                      </div>
                      <MenuItem href="/profile" icon="user" onClick={() => setMenuOpen(false)}>
                        Profile
                      </MenuItem>
                      <MenuItem href="/settings" icon="settings" onClick={() => setMenuOpen(false)}>
                        Settings
                      </MenuItem>
                      {role === "customer" && (
                        <MenuItem href="/bookings" icon="book" onClick={() => setMenuOpen(false)}>
                          My bookings
                        </MenuItem>
                      )}
                      {role === "provider" && (
                        <MenuItem
                          href="/pro/dashboard"
                          icon="briefcase"
                          onClick={() => setMenuOpen(false)}
                        >
                          Dashboard
                        </MenuItem>
                      )}
                      {role === "admin" && (
                        <MenuItem href="/admin" icon="building" onClick={() => setMenuOpen(false)}>
                          Admin
                        </MenuItem>
                      )}
                      <button
                        onClick={signOut}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-destructive hover:bg-destructive-light"
                      >
                        <Icon name="logout" size="sm" /> Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/signin" className="btn-ghost btn-sm">
                Sign in
              </Link>
              <Link href="/signup" className="btn-primary btn-sm">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({
  href,
  icon,
  children,
  onClick,
}: {
  href: string;
  icon: Parameters<typeof Icon>[0]["name"];
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-secondary"
    >
      <Icon name={icon} size="sm" /> {children}
    </Link>
  );
}
