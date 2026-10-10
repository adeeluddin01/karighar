"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/useUser";
import { Screen, TabBar } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { EmptyK, Pill, Skel } from "@/components/kg/parts";
import { MapArt, type MapPin } from "@/components/kg/MapArt";
import { formatPKR } from "@/lib/money";
import { areaOf } from "@/lib/area";
import type { Service } from "@/lib/types";

type PublicPro = {
  id: string;
  full_name: string | null;
  bio: string | null;
  rating_avg: number;
  jobs_completed: number;
  service_areas: string[];
};

// The redesign scatters its price pins at these spots in the map's 390x410
// viewBox; real pros are dropped onto them in order. Providers have no stored
// coordinates, so — as in the prototype — the map is illustrative and the pins
// are the selector.
const SPOTS = [
  { x: 258, y: 232 },
  { x: 70, y: 205 },
  { x: 218, y: 120 },
  { x: 118, y: 330 },
  { x: 330, y: 330 },
  { x: 180, y: 60 },
  { x: 60, y: 110 },
  { x: 300, y: 390 },
];

export default function MapScreen() {
  const { user } = useUser();
  const [pros, setPros] = useState<PublicPro[] | null>(null);
  const [sel, setSel] = useState(0);
  const [from, setFrom] = useState<number | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    setBusy(true);
    const [{ data: list }, { data: services }] = await Promise.all([
      supabase
        .from("public_provider_profiles")
        .select("id,full_name,bio,rating_avg,jobs_completed,service_areas")
        .order("rating_avg", { ascending: false })
        .order("jobs_completed", { ascending: false })
        .limit(SPOTS.length),
      supabase.from("services").select("base_price").eq("is_active", true),
    ]);
    const prices = ((services as Pick<Service, "base_price">[]) ?? [])
      .map((s) => s.base_price)
      .filter((p): p is number => p !== null);
    setFrom(prices.length ? Math.min(...prices) : null);
    setPros((list as PublicPro[]) ?? []);
    setSel(0);
    setBusy(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) {
      setArea(null);
      return;
    }
    createClient()
      .from("customers")
      .select("default_address")
      .eq("profile_id", user.id)
      .maybeSingle()
      .then(({ data }) =>
        setArea(areaOf((data as { default_address: string | null } | null)?.default_address))
      );
  }, [user]);

  const pins: MapPin[] = (pros ?? []).map((p, i) => ({
    ...SPOTS[i],
    label: Number(p.rating_avg) ? `${Number(p.rating_avg).toFixed(1)} ★` : "New",
    on: i === sel,
  }));

  const pro = pros?.[sel] ?? null;

  return (
    <Screen>
      <div className="map">
        <MapArt kind="nearby" pins={pins} />
        {/* The pins are drawn inside the SVG; these transparent hit areas sit
            on top so each one is a real, focusable button. */}
        <svg
          viewBox="0 0 390 410"
          preserveAspectRatio="xMidYMid slice"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          {(pros ?? []).map((p, i) => (
            <rect
              key={p.id}
              x={SPOTS[i].x - 33}
              y={SPOTS[i].y - 15}
              width="66"
              height="30"
              rx="15"
              fill="transparent"
              style={{ cursor: "pointer" }}
              role="button"
              tabIndex={0}
              aria-label={`Select ${p.full_name ?? "pro"}`}
              aria-pressed={i === sel}
              onClick={() => setSel(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSel(i);
                }
              }}
            />
          ))}
        </svg>

        <div className="map-top">
          <Link className="ic" href="/" aria-label="Back">
            <KIcon name="chev-l" />
          </Link>
          <div className="in pillin">
            <KIcon name="search" />
            <span>{area ? `${area}, Karachi` : "Karachi"}</span>
          </div>
          <Link className="ic" href="/book" aria-label="Filter by service">
            <KIcon name="sliders" />
          </Link>
        </div>

        <button
          type="button"
          className="ic locate"
          aria-label="Refresh nearby pros"
          onClick={load}
          disabled={busy}
        >
          <KIcon name="refresh" />
        </button>
      </div>

      <div className="sheet">
        <span className="grab" />

        {pros === null ? (
          <>
            <Skel h={46} />
            <Skel h={28} />
            <Skel h={64} />
          </>
        ) : !pro ? (
          <EmptyK
            icon="users"
            title="No verified pros yet"
            hint="Pros appear here once their CNIC verification is approved. You can still book — we'll match you as soon as one is available."
          >
            <Link className="btn sm" href="/book" style={{ marginTop: 10 }}>
              Book a service
            </Link>
          </EmptyK>
        ) : (
          <>
            <div className="sh-head">
              <div>
                <h2>{pro.full_name ?? "Pro"}</h2>
                <small>
                  {pro.service_areas?.length
                    ? pro.service_areas.slice(0, 2).join(" · ")
                    : "Karachi"}{" "}
                  · {sel + 1} of {pros.length} nearby
                </small>
              </div>
              <Link
                className="ic sm"
                href={`/providers/view/?id=${pro.id}`}
                aria-label="View full profile"
              >
                <KIcon name="chev-r" />
              </Link>
            </div>

            <div className="badges">
              <Pill tone="ok" icon="shield">
                CNIC verified
              </Pill>
              <Pill icon="star">
                {Number(pro.rating_avg)
                  ? `${Number(pro.rating_avg).toFixed(1)} (${pro.jobs_completed})`
                  : "New pro"}
              </Pill>
              {pro.service_areas?.[0] && <Pill>{pro.service_areas[0]}</Pill>}
            </div>

            <div className="stats3">
              <div>
                <small>Jobs done</small>
                <b>{pro.jobs_completed.toLocaleString("en-PK")}</b>
              </div>
              <div>
                <small>Rating</small>
                <b>{Number(pro.rating_avg) ? Number(pro.rating_avg).toFixed(1) : "—"}</b>
              </div>
              <div>
                <small>Areas</small>
                <b>{pro.service_areas?.length ?? 0}</b>
              </div>
            </div>

            <p className="desc">
              {pro.bio ??
                "This pro hasn't written a bio yet. Their rating and completed jobs come from real Karighar bookings."}
            </p>

            <div className="sh-cta">
              <div>
                <small>Visits from</small>
                <b>{from === null ? "On quote" : formatPKR(from)}</b>
              </div>
              <Link className="btn" href="/book">
                Book now
              </Link>
            </div>
          </>
        )}
      </div>

      <TabBar />
    </Screen>
  );
}
