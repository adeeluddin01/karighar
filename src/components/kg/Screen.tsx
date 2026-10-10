"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { KIcon, type KIconName } from "@/components/kg/icons";
import { PHONE_NAV, isActive, roleOf } from "@/components/nav";
import { useUser } from "@/lib/useUser";
import { clsx } from "@/lib/clsx";

/* ============================================================
   The phone surface.

   `Karighar Redesign.html` draws each screen inside a 390x844 frame on a
   showcase stage. Here the device *is* the frame: `.kg` is fixed to the
   viewport, the mock status bar is gone (the real one sits above it) and
   safe-area insets take its place.

   This only ever renders below `md` (768px) — from there up a route shows
   its web lane instead. See components/Lanes.tsx.
   ============================================================ */

export function Screen({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={clsx("kg", className)}>{children}</div>;
}

/**
 * The scrolling body of a screen.
 * - `underTop` starts it below a <TopBar>.
 * - `pad` reserves room at the bottom: `nav` for the tab bar (default),
 *   `cta` for the taller action bar, `plain` for neither.
 */
export function Scroll({
  children,
  underTop,
  pad = "nav",
  className,
}: {
  children: React.ReactNode;
  underTop?: boolean;
  pad?: "nav" | "cta" | "plain";
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "scroll",
        underTop && "under-top",
        pad === "cta" && "pad-cta",
        pad === "plain" && "pad-plain",
        className
      )}
    >
      {children}
    </div>
  );
}

/** The gradient that fades scrolling content out behind the tab bar. */
export function Fade() {
  return <div className="fade" />;
}

/** Floating header: a round back button, a centred title, one action. */
export function TopBar({
  title,
  back,
  backIcon = "chev-l",
  backLabel = "Back",
  action,
}: {
  title?: React.ReactNode;
  /** An href, or omit to pop the history stack. */
  back?: string;
  backIcon?: KIconName;
  backLabel?: string;
  action?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="topbar">
      {back ? (
        <Link href={back} className="ic" aria-label={backLabel}>
          <KIcon name={backIcon} />
        </Link>
      ) : (
        <button type="button" className="ic" aria-label={backLabel} onClick={() => router.back()}>
          <KIcon name={backIcon} />
        </button>
      )}
      {title ? <h1>{title}</h1> : <span style={{ flex: 1 }} />}
      {action ?? <span style={{ width: 44, flex: "none" }} />}
    </div>
  );
}

/** The bottom action bar — one saffron button per screen. */
export function Cta({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("cta", className)}>{children}</div>;
}

/* ============================================================
   Tab bar
   ============================================================ */

/**
 * The white pill tab bar with a dark active pill that grows to show its
 * label — the redesign's `nav.nav`.
 *
 * Role-aware, from the same PHONE_NAV that drives <BottomNav> on the
 * provider/admin pages: a provider looking at a customer screen gets their own
 * destinations, just as they get their own sidebar on desktop.
 */
export function TabBar() {
  const pathname = usePathname();
  const { user, profile, providerStatus } = useUser();
  // While the session resolves this reads as `guest`, whose tabs match the
  // customer set — so the common case never flickers.
  const tabs = PHONE_NAV[roleOf(!!user, profile?.role, providerStatus)];

  return (
    <nav className="nav" aria-label="Tabs">
      {tabs.map((t) => {
        const on = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(on && "on")}
            aria-label={t.label}
            aria-current={on ? "page" : undefined}
          >
            <KIcon name={t.kicon} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Tab bar + the fade behind it — the usual pairing on a tabbed screen. */
export function Tabs() {
  return (
    <>
      <Fade />
      <TabBar />
    </>
  );
}
