// Thin wrapper over lucide-react so the app keeps its own small, stable
// `IconName` vocabulary (and the `size="sm"|"md"|"lg"` API every call site
// already uses) while the glyphs themselves come from a maintained, premium
// icon set instead of hand-copied SVG paths.
// Server-safe: no hooks, no "use client".

import {
  Home,
  BookCheck,
  MapPin,
  Wrench,
  Building2,
  ArrowLeft,
  X,
  Phone,
  MessageCircle,
  Search,
  Clock,
  Check,
  Star,
  ShieldCheck,
  Plus,
  Users,
  Wallet,
  TrendingUp,
  Send,
  Calendar,
  ChevronRight,
  Briefcase,
  Trash2,
  Info,
  Bell,
  Settings,
  User,
  LogOut,
  Map,
  Menu,
  AlertTriangle,
  History,
  FileText,
  PartyPopper,
  Inbox,
  Hourglass,
  Ban,
  Snowflake,
  Zap,
  IdCard,
  CreditCard,
  Tag,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  book: BookCheck,
  pin: MapPin,
  wrench: Wrench,
  building: Building2,
  back: ArrowLeft,
  x: X,
  phone: Phone,
  chat: MessageCircle,
  search: Search,
  clock: Clock,
  check: Check,
  star: Star,
  shield: ShieldCheck,
  plus: Plus,
  users: Users,
  wallet: Wallet,
  trend: TrendingUp,
  send: Send,
  calendar: Calendar,
  chevron: ChevronRight,
  briefcase: Briefcase,
  trash: Trash2,
  info: Info,
  bell: Bell,
  settings: Settings,
  user: User,
  logout: LogOut,
  map: Map,
  menu: Menu,
  alert: AlertTriangle,
  history: History,
  file: FileText,

  // Empty-state and service-category glyphs (replace emoji with real icons).
  party: PartyPopper,
  inbox: Inbox,
  hourglass: Hourglass,
  ban: Ban,
  snowflake: Snowflake,
  zap: Zap,
  idcard: IdCard,
  creditcard: CreditCard,
  tag: Tag,
};

export type IconName = keyof typeof ICONS;

const SIZES = { sm: "1rem", md: "1.25rem", lg: "1.5rem" } as const;

export function Icon({
  name,
  size = "md",
  className,
}: {
  name: IconName;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const px = SIZES[size];
  const Cmp = ICONS[name];
  return (
    <Cmp
      width={px}
      height={px}
      strokeWidth={2}
      style={{ width: px, height: px, flexShrink: 0, display: "block" }}
      className={className}
      aria-hidden="true"
    />
  );
}

/** "Imran Qureshi" -> "IQ" — the prototype's avatar initials helper. */
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
