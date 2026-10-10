import { KIcon, type KIconName } from "@/components/kg/icons";
import { clsx } from "@/lib/clsx";

/* Small shared pieces of the redesign's vocabulary. Server-safe. */

/** "Bilal Ahmed" -> "BA" */
export function initials(name?: string | null) {
  if (!name) return "?";
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/** Round initials avatar, optionally with the leaf verified tick. */
export function Ava({
  name,
  size,
  verified,
  className,
}: {
  name?: string | null;
  size?: "lg" | "xl";
  verified?: boolean;
  className?: string;
}) {
  return (
    <span className={clsx("ava", size, className)}>
      {initials(name)}
      {verified && (
        <i className="vbadge">
          <KIcon name="check" />
        </i>
      )}
    </span>
  );
}

/** Rounded-square icon well in the brand tint. */
export function Well({
  icon,
  size,
  children,
  className,
}: {
  icon?: KIconName;
  size?: "sm" | "lg";
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={clsx("well", size, className)}>
      {icon ? <KIcon name={icon} /> : children}
    </span>
  );
}

export function Pill({
  children,
  tone,
  icon,
  live,
  className,
}: {
  children: React.ReactNode;
  tone?: "ok" | "act" | "warn" | "bad" | "soon";
  icon?: KIconName;
  /** Pulsing leaf dot, for an in-progress booking. */
  live?: boolean;
  className?: string;
}) {
  return (
    <span className={clsx("pill", tone, className)}>
      {live && <span className="dot" />}
      {/* A star in a pill is always the filled, gold one. */}
      {icon && <KIcon name={icon} xs className={icon === "star" ? "star" : undefined} />}
      {children}
    </span>
  );
}

/** Star + value, as used on the pro cards. */
export function Rate({ value, suffix }: { value?: number | null; suffix?: string }) {
  return (
    <span className="rate">
      <KIcon name="star" className="star" xs />
      {value ? value.toFixed(1) : "New"}
      {suffix ? ` · ${suffix}` : ""}
    </span>
  );
}

export function Spin({ label }: { label?: string }) {
  return (
    <div className="empty-k">
      <div className="spin" role="status" aria-label={label ?? "Loading"} />
      {label && <small>{label}</small>}
    </div>
  );
}

export function Skel({ h = 80, className }: { h?: number; className?: string }) {
  return <div className={clsx("skel", className)} style={{ height: h }} aria-hidden="true" />;
}

export function EmptyK({
  icon = "inbox",
  title,
  hint,
  children,
}: {
  icon?: KIconName;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-k">
      <Well icon={icon} size="lg" />
      <h3 style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>{title}</h3>
      {hint && <small>{hint}</small>}
      {children}
    </div>
  );
}

/** Section heading with an optional trailing link. */
export function Sec({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="sec">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
