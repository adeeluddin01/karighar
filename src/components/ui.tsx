import Link from "next/link";
import { clsx } from "@/lib/clsx";
import { Icon, type IconName, initials as nameInitials } from "@/components/Icon";
export { formatPKR } from "@/lib/money";
export { initials } from "@/components/Icon";

/* ============================== buttons ============================== */

type Variant = "primary" | "outline" | "ghost" | "danger";

// `outline` is kept as an alias of ghost so existing call sites keep working.
const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  outline: "btn-ghost",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

export function Button({
  children,
  variant = "primary",
  size,
  icon,
  round,
  className,
  type = "button",
  disabled,
  onClick,
}: {
  children?: React.ReactNode;
  variant?: Variant;
  size?: "sm";
  icon?: IconName;
  round?: boolean;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        variantClass[variant],
        size === "sm" && "btn-sm",
        round && "btn-round",
        className
      )}
    >
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </button>
  );
}

export function LinkButton({
  children,
  href,
  variant = "primary",
  size,
  icon,
  className,
  target,
}: {
  children?: React.ReactNode;
  href: string;
  variant?: Variant;
  size?: "sm";
  icon?: IconName;
  className?: string;
  target?: string;
}) {
  return (
    <Link
      href={href}
      target={target}
      rel={target === "_blank" ? "noopener" : undefined}
      className={clsx(variantClass[variant], size === "sm" && "btn-sm", className)}
    >
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </Link>
  );
}

/* ============================== surfaces ============================== */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={clsx("surface", padded && "p-5", className)}>{children}</div>;
}

export function Stat({
  label,
  value,
  icon,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: IconName;
  className?: string;
}) {
  return (
    <div className={clsx("surface stat", className)}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon && <Icon name={icon} size="sm" />}
        {label}
      </p>
      <p className="v">{value}</p>
    </div>
  );
}

export function KV({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div className={clsx("sep", className)} />;
}

/* ============================== labels ============================== */

export function Pill({
  children,
  tone = "info",
  icon,
  className,
}: {
  children: React.ReactNode;
  tone?: "ok" | "warn" | "bad" | "info" | "gray";
  icon?: IconName;
  className?: string;
}) {
  return (
    <span className={clsx("pill", tone, className)}>
      {icon && <Icon name={icon} size="sm" />}
      {children}
    </span>
  );
}

export function Badge({
  children,
  tone = "brand",
  icon,
}: {
  children: React.ReactNode;
  tone?: "brand" | "amber" | "green" | "rose" | "slate";
  icon?: IconName;
}) {
  const tones = { brand: "info", amber: "warn", green: "ok", rose: "bad", slate: "gray" } as const;
  return (
    <Pill tone={tones[tone]} icon={icon}>
      {children}
    </Pill>
  );
}

export function Avatar({
  name,
  size,
  children,
  className,
}: {
  name?: string | null;
  size?: "sm" | "lg";
  children?: React.ReactNode;
  className?: string;
}) {
  return <span className={clsx("avatar", size, className)}>{children ?? nameInitials(name)}</span>;
}

export function Rating({ value, className }: { value?: number | null; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1", className)}>
      <span className="star">★</span>
      {value ? value.toFixed(1) : "New"}
    </span>
  );
}

/* ============================== inputs ============================== */

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label?: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      {label && <span className="lbl mb-2">{label}</span>}
      {children}
      {error ? (
        <span className="errtxt mt-1.5 block">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

// Legacy escape hatch for pages that style a raw <input> themselves. Prefer <Input>.
export const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-2.5 text-foreground outline-none focus:border-primary";

export function Input({
  prefix,
  error,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> & {
  prefix?: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div className={clsx("field", error && "err", className)}>
      {prefix && <span className="pre">{prefix}</span>}
      <input {...rest} />
    </div>
  );
}

export function Textarea({
  error,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  return (
    <div className={clsx("field", error && "err", className)}>
      <textarea {...rest} />
    </div>
  );
}

export function Select({
  children,
  error,
  className,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) {
  return (
    <div className={clsx("field", error && "err", className)}>
      <select {...rest}>{children}</select>
      <Icon name="chevron" size="sm" className="rotate-90 text-muted-foreground" />
    </div>
  );
}

export function Chip({
  children,
  active,
  onClick,
  className,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx("chip", active && "on", className)}
    >
      {active && <Icon name="check" size="sm" />}
      {children}
    </button>
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={clsx("toggle", on && "on")}
    />
  );
}

/* ============================== navigation ============================== */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { key: T; label: React.ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx("tabs max-w-full overflow-x-auto", className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={clsx(value === t.key && "on")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ total, step }: { total: number; step: number }) {
  return (
    <div className="progress">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={clsx(i < step && "on")} />
      ))}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("mb-6 flex flex-wrap items-center justify-between gap-3", className)}>
      <div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ============================== tables ============================== */

export function DataTable({
  head,
  children,
  className,
}: {
  head: React.ReactNode[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("scroll-x", className)}>
      <table className="data-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ============================== feedback ============================== */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-xl bg-secondary", className)} />;
}

export function EmptyState({
  icon = "inbox",
  title,
  hint,
  children,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="surface empty">
      <span className="emoji lg mx-auto">
        <Icon name={icon} size="lg" className="text-accent-foreground" />
      </span>
      <h3 className="mt-3 text-base font-bold">{title}</h3>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function LiveDot() {
  return <span className="live" />;
}
