"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/useUser";
import { useIsPhone } from "@/components/Lanes";
import { Screen, Scroll, Tabs } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Ava, Pill, Rate, Sec, Skel, Well } from "@/components/kg/parts";
import { categoryIcon } from "@/components/kg/catalogIcons";
import { formatPKR } from "@/lib/money";
import { JOB_STATUS_LABEL, type Job, type Service, type ServiceCategory } from "@/lib/types";
import { areaOf } from "@/lib/area";
import { fetchPublicPros, proName, type PublicPro } from "@/lib/providers";

type Cat = ServiceCategory & { services: Service[] };
// The statuses that put a booking on the Home screen's live banner.
const LIVE: Job["status"][] = ["assigned", "en_route", "arrived", "in_progress"];

// The cheapest priced service in a category. The unit travels with it: a
// category whose floor is "Rs 65 / sq ft" must not read as "From Rs 65".
function cheapest(services: Service[]) {
  const priced = services.filter((s): s is Service & { base_price: number } => s.base_price !== null);
  if (!priced.length) return null;
  return priced.reduce((a, b) => (b.base_price < a.base_price ? b : a));
}

export default function HomeScreen() {
  const { user, profile } = useUser();
  const router = useRouter();
  // Home renders both lanes so the web one keeps its prerendered content for
  // crawlers (see LaneSplit) — which means this tree also mounts on desktop,
  // hidden. Gate the queries so they only run when this lane is the live one.
  const isPhone = useIsPhone();

  const [cats, setCats] = useState<Cat[] | null>(null);
  const [pros, setPros] = useState<PublicPro[]>([]);
  const [live, setLive] = useState<(Job & { proName?: string | null }) | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [q, setQ] = useState("");

  // Catalog + top-rated pros: public, so this runs for guests too.
  useEffect(() => {
    if (isPhone !== true) return;
    const supabase = createClient();
    (async () => {
      const [{ data: categories }, { data: services }, topPros] = await Promise.all([
        supabase.from("service_categories").select("*").order("sort_order"),
        supabase.from("services").select("*").eq("is_active", true),
        fetchPublicPros(supabase, { limit: 8 }),
      ]);
      setCats(
        ((categories as ServiceCategory[]) ?? []).map((c) => ({
          ...c,
          services: ((services as Service[]) ?? []).filter((s) => s.category_id === c.id),
        }))
      );
      setPros(topPros.pros);
    })();
  }, [isPhone]);

  // The signed-in customer's live booking + their saved area.
  useEffect(() => {
    if (isPhone !== true) return;
    if (!user) {
      setLive(null);
      setArea(null);
      return;
    }
    const supabase = createClient();
    (async () => {
      const [{ data: jobs }, { data: customer }] = await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .eq("customer_id", user.id)
          .in("status", LIVE)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase.from("customers").select("default_address").eq("profile_id", user.id).maybeSingle(),
      ]);
      const job = ((jobs as Job[]) ?? [])[0] ?? null;
      setArea(areaOf((customer as { default_address: string | null } | null)?.default_address));
      if (!job) {
        setLive(null);
        return;
      }
      let name: string | null = null;
      if (job.provider_id) {
        const { pros } = await fetchPublicPros(supabase, { id: job.provider_id });
        name = pros[0]?.full_name ?? null;
      }
      setLive({ ...job, proName: name });
    })();
  }, [user, isPhone]);

  // "Most booked" hero: the first active category in catalog order.
  const hero = useMemo(() => cats?.find((c) => c.is_active && c.services.length > 0), [cats]);
  const heroFrom = hero ? cheapest(hero.services) : null;

  // The three figures on the hero. Before any pro is approved there's no
  // rating or job count to show, so it falls back to facts about the catalog.
  const heroStats = useMemo(() => {
    if (!cats) return null;
    const rated = pros.filter((p) => Number(p.rating_avg) > 0);
    const jobs = pros.reduce((n, p) => n + p.jobs_completed, 0);
    if (rated.length || jobs) {
      const avg = rated.length
        ? rated.reduce((n, p) => n + Number(p.rating_avg), 0) / rated.length
        : 0;
      return [
        ["Rating", avg ? `${avg.toFixed(1)} ★` : "New"],
        ["Jobs done", jobs.toLocaleString("en-PK")],
        ["Verified pros", String(pros.length)],
      ] as const;
    }
    return [
      ["Services", String(hero?.services.length ?? 0)],
      ["From", heroFrom ? formatPKR(heroFrom.base_price) : "On quote"],
      ["You pay", "After the job"],
    ] as const;
  }, [cats, pros, hero, heroFrom]);

  return (
    <Screen>
      <Scroll>
        <header className="hh">
          <Link className="who" href={user ? "/profile" : "/signin"}>
            <Ava name={profile?.full_name ?? user?.email ?? null} />
            <div>
              <small>Salaam 👋</small>
              <b>{profile?.full_name || (user ? "Your profile" : "Welcome")}</b>
            </div>
          </Link>
          <Link className="loc" href={user ? "/profile" : "/signin"}>
            <small>Location</small>
            <b>
              <KIcon name="pin" />
              {area ?? "Karachi"}
              <KIcon name="chev-d" xs />
            </b>
          </Link>
        </header>

        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(q.trim() ? `/book/?q=${encodeURIComponent(q.trim())}` : "/book");
          }}
        >
          <label className="in">
            <KIcon name="search" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search services, e.g. leaking tap"
              aria-label="Search services"
            />
          </label>
          <Link className="ic sq" href="/book" aria-label="Browse all services">
            <KIcon name="sliders" />
          </Link>
        </form>

        {live && (
          <Link className="live" href={`/bookings/view/?id=${live.id}`}>
            <span className="dot" />
            <div>
              <b>
                {live.proName
                  ? `${live.proName.split(/\s+/)[0]} is ${live.status === "en_route" ? "on the way" : JOB_STATUS_LABEL[live.status].toLowerCase()}`
                  : JOB_STATUS_LABEL[live.status]}
              </b>
              <small>
                {live.title}
                {live.scheduled_at
                  ? ` · ${new Date(live.scheduled_at).toLocaleTimeString("en-PK", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : ""}
              </small>
            </div>
            <span className="btn sm dark">Track</span>
          </Link>
        )}

        {cats === null ? (
          <>
            <Skel h={188} />
            <Skel h={104} />
          </>
        ) : (
          hero && (
            <Link className="hero" href={`/book/?cat=${hero.id}`}>
              <div className="hero-top">
                <Pill tone="act" icon="flame">
                  Most booked
                </Pill>
                <span className="ic glass" aria-hidden="true">
                  <KIcon name="heart" />
                </span>
              </div>
              <svg className="hero-ic" aria-hidden="true">
                <use href={`#i-${categoryIcon(hero.icon)}`} />
              </svg>
              <div>
                <h2>{hero.name}</h2>
                <p>
                  {hero.services
                    .slice(0, 2)
                    .map((s) => s.name)
                    .join(" · ")}
                  {heroFrom && ` · from ${formatPKR(heroFrom.base_price)}`}
                </p>
                {heroStats && (
                  <div className="hero-stats">
                    {heroStats.map(([label, value]) => (
                      <div key={label}>
                        <small>{label}</small>
                        <b>{value}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          )
        )}

        <Sec title="Services">
          <Link href="/book">See all</Link>
        </Sec>
        {cats === null ? (
          <div className="grid3">
            <Skel h={96} />
            <Skel h={96} />
            <Skel h={96} />
          </div>
        ) : (
          <div className="grid3">
            {cats.map((c) => {
              const from = cheapest(c.services);
              const soon = !c.is_active || c.services.length === 0;
              const body = (
                <>
                  <Well icon={categoryIcon(c.icon)} />
                  <b>{c.name}</b>
                  <small>
                    {soon
                      ? "Coming soon"
                      : from === null
                        ? "On quote"
                        : `From ${formatPKR(from.base_price)}/${from.unit}`}
                  </small>
                </>
              );
              return soon ? (
                <span key={c.id} className="tile soon">
                  {body}
                </span>
              ) : (
                <Link key={c.id} className="tile" href={`/book/?cat=${c.id}`}>
                  {body}
                </Link>
              );
            })}
          </div>
        )}

        {pros.length > 0 && (
          <>
            <Sec title="Top-rated near you">
              <Link href="/map">Open map</Link>
            </Sec>
            <div className="hrow">
              {pros.slice(0, 6).map((p) => (
                <Link key={p.id} className="pro-card" href={`/providers/view/?id=${p.id}`}>
                  <Ava name={proName(p)} size="lg" />
                  <div>
                    <b>{proName(p)}</b>
                    <small>{p.service_areas?.[0] ?? "Karachi"}</small>
                    <Rate
                      value={Number(p.rating_avg)}
                      suffix={`${p.jobs_completed.toLocaleString("en-PK")} jobs`}
                    />
                  </div>
                  <KIcon name="chev-r" className="chev" />
                </Link>
              ))}
            </div>
          </>
        )}

        {!user && (
          <Link className="promo" href="/signup">
            <div>
              <span className="eyebrow">New here?</span>
              <b>Create an account</b>
              <p>
                Save your addresses, track your pro live on the map and keep every receipt in one
                place.
              </p>
            </div>
            <span className="ic">
              <KIcon name="arrow" />
            </span>
          </Link>
        )}
      </Scroll>
      <Tabs />
    </Screen>
  );
}
