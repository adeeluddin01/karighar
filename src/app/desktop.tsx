import Link from "next/link";
import { CATALOG, formatPKR } from "@/lib/catalog";
import { AppShell } from "@/components/AppShell";
import { HeroSearch } from "@/components/HeroSearch";
import { Icon, type IconName } from "@/components/Icon";
import { Card, LinkButton } from "@/components/ui";
import { BRAND } from "@/lib/config";

const HOW_IT_WORKS = [
  ["1", "Pick a service", "Choose a fixed-price service or post a custom job for quotes."],
  ["2", "Get matched", "A verified pro near you accepts — or bids on your custom job."],
  ["3", "Track live", "Follow your pro on the map from on-the-way to arrived."],
  ["4", "Pay & rate", "Pay cash on completion, then rate your pro."],
] as const;

const GUARANTEE: [IconName, string, string][] = [
  ["idcard", "CNIC-verified pros", "Every pro passes identity and background checks."],
  ["creditcard", "Pay after the job", "No advance payment. Cash on completion."],
  ["tag", "Upfront pricing", "You see the price before you book — no surprises."],
  ["shield", "Satisfaction guarantee", "Not fixed properly? Tell us and we make it right."],
];

// Cheapest listed price in a category, for the "From Rs …" line on the service cards.
function fromPrice(services: { basePrice: number | null }[]) {
  const prices = services.map((s) => s.basePrice).filter((p): p is number => p !== null);
  return prices.length ? Math.min(...prices) : null;
}

export default function Home() {
  return (
    <AppShell>
      {/* Hero */}
      <section className="hero">
        <p className="text-sm font-semibold opacity-85">Salaam 👋 {BRAND.city}</p>
        <h1 className="relative z-[1] mt-1 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
          What do you need
          <br />
          help with?
        </h1>
        <p className="relative z-[1] mt-2 text-sm opacity-85">
          CNIC-verified technicians at your door, with fixed prices and live tracking.
        </p>
        <HeroSearch />
      </section>

      {/* Services */}
      <div className="mt-10 mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Our services</h2>
        <span className="text-xs text-muted-foreground">{CATALOG.length} available</span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {CATALOG.map((cat) => {
          const from = fromPrice(cat.services);
          return (
            <Link key={cat.key} href="/book" className="opt">
              <span className="emoji">
                <Icon name={cat.icon as IconName} className="text-accent-foreground" />
              </span>
              <span className="text-base font-bold">{cat.name}</span>
              <span className="text-xs text-muted-foreground">
                {from === null ? "On quote" : `From ${formatPKR(from)}`}
              </span>
            </Link>
          );
        })}
      </div>

      {/* How it works */}
      <h2 className="mt-12 mb-4 text-xl font-bold tracking-tight">How it works</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {HOW_IT_WORKS.map(([n, title, desc]) => (
          <Card key={n}>
            <span className="avatar">{n}</span>
            <p className="mt-3 text-base font-bold">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </Card>
        ))}
      </div>

      {/* Guarantee */}
      <Card className="mt-6">
        <div className="flex items-center gap-4">
          <span className="emoji">
            <Icon name="shield" size="lg" className="text-accent-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold">The {BRAND.name} Guarantee</p>
            <p className="text-sm text-muted-foreground">
              Verified pros, upfront prices, and you only pay once the work is done.
            </p>
          </div>
        </div>
        <div className="sep" />
        <div className="grid gap-4 sm:grid-cols-2">
          {GUARANTEE.map(([icon, title, desc]) => (
            <div key={title} className="flex items-start gap-3">
              <span className="emoji">
                <Icon name={icon} className="text-accent-foreground" />
              </span>
              <div>
                <p className="text-sm font-bold">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Prices */}
      <div className="mt-12 mb-4">
        <h2 className="text-xl font-bold tracking-tight">Services &amp; prices</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Transparent {BRAND.city} rates. You see the price before you book.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {CATALOG.map((cat) => (
          <Card key={cat.key} className="flex flex-col">
            <div className="flex items-center gap-3">
              <span className="emoji">
                <Icon name={cat.icon as IconName} className="text-accent-foreground" />
              </span>
              <h3 className="text-base font-bold">{cat.name}</h3>
            </div>
            <div className="sep" />
            <div className="flex-1">
              {cat.services.map((s) => (
                <div key={s.name} className="kv items-start">
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">{s.description}</span>
                  </span>
                  <span className="whitespace-nowrap">
                    {formatPKR(s.basePrice)}
                    <span className="block text-xs font-normal text-muted-foreground">
                      / {s.unit}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <LinkButton href="/book" variant="ghost" size="sm" className="mt-4 w-full">
              Book {cat.name}
              <Icon name="chevron" size="sm" />
            </LinkButton>
          </Card>
        ))}
      </div>

      {/* Pro / business */}
      <div className="mt-8 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Are you a professional?</span>
        <Link href="/pro" className="font-semibold text-primary">
          Join as a technician →
        </Link>
      </div>

      {/* Footer */}
      <footer className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <span className="font-extrabold text-primary">{BRAND.name}</span>
          <nav className="flex flex-wrap gap-4">
            <Link href="/support" className="hover:text-foreground">
              Support
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/pro" className="hover:text-foreground">
              Become a Pro
            </Link>
          </nav>
          <span className="text-xs">
            © {new Date().getFullYear()} {BRAND.name} · {BRAND.city}, Pakistan
          </span>
        </div>
      </footer>
    </AppShell>
  );
}
