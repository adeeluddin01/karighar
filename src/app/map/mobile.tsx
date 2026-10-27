"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/useUser";
import { Screen, TabBar } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Ava, EmptyK, Pill, Rate, Skel } from "@/components/kg/parts";
import { NearbyMap, type MapJob } from "@/components/kg/NearbyMap";
import { fetchPublicPros, proName, type PublicPro } from "@/lib/providers";
import { businessName, fetchBusinessPins, type BusinessPin } from "@/lib/businesses";
import { categoryIcon } from "@/components/kg/catalogIcons";
import { formatPKR } from "@/lib/money";
import { areaOf } from "@/lib/area";
import type { Job, Service } from "@/lib/types";
import type { LatLng } from "@/lib/maps";

const OPEN: Job["status"][] = ["created", "bidding", "assigned", "en_route", "arrived", "in_progress"];

export default function MapScreen() {
  const { user } = useUser();
  const router = useRouter();
  const [pros, setPros] = useState<PublicPro[] | null>(null);
  // Companies are the only thing on this screen with real coordinates, so
  // they are the only thing that can be pinned. Empty on an installation
  // with no business accounts, which leaves the map exactly as it was.
  const [firms, setFirms] = useState<BusinessPin[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [home, setHome] = useState<LatLng | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [jobs, setJobs] = useState<MapJob[]>([]);
  const [recenter, setRecenter] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    setBusy(true);
    const [result, { data: services }, pins] = await Promise.all([
      fetchPublicPros(supabase, { limit: 30 }),
      supabase.from("services").select("base_price").eq("is_active", true),
      fetchBusinessPins(supabase),
    ]);
    const prices = ((services as Pick<Service, "base_price">[]) ?? [])
      .map((s) => s.base_price)
      .filter((p): p is number => p !== null);
    setFrom(prices.length ? Math.min(...prices) : null);
    setFirms(pins);
    setPros(result.pros);
    setDegraded(result.degraded);
    setError(result.error);
    setBusy(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Where to centre, and what of the customer's own we can actually plot.
  useEffect(() => {
    if (!user) {
      setHome(null);
      setArea(null);
      setJobs([]);
      return;
    }
    const supabase = createClient();
    (async () => {
      const [{ data: customer }, { data: rows }] = await Promise.all([
        supabase
          .from("customers")
          .select("default_address,lat,lng")
          .eq("profile_id", user.id)
          .maybeSingle(),
        supabase.from("jobs").select("id,title,lat,lng,status").eq("customer_id", user.id).in("status", OPEN),
      ]);
      const c = customer as { default_address: string | null; lat: number | null; lng: number | null } | null;
      setArea(areaOf(c?.default_address));
      setHome(c?.lat != null && c?.lng != null ? { lat: c.lat, lng: c.lng } : null);
      setJobs(
        ((rows as Pick<Job, "id" | "title" | "lat" | "lng">[]) ?? [])
          .filter((j): j is MapJob => j.lat != null && j.lng != null)
          .map((j) => ({ id: j.id, title: j.title, lat: j.lat, lng: j.lng }))
      );
    })();
  }, [user]);

  return (
    <Screen>
      <div className="map">
        <NearbyMap
          home={home}
          jobs={jobs}
          businesses={firms}
          onPickBusiness={(id) => router.push(`/businesses/view/?id=${id}`)}
          recenter={recenter}
        />

        <div className="map-top">
          <Link className="ic" href="/" aria-label="Back">
            <KIcon name="chev-l" />
          </Link>
          <div className="in pillin">
            <KIcon name="search" />
            <span>{area ? `${area}, Karachi` : "Karachi"}</span>
          </div>
          <Link className="ic" href="/book" aria-label="Browse services">
            <KIcon name="sliders" />
          </Link>
        </div>

        <button
          type="button"
          className="ic locate"
          aria-label={home ? "Centre on my address" : "Refresh"}
          disabled={busy}
          onClick={() => (home ? setRecenter({ ...home }) : load())}
        >
          <KIcon name={home ? "nav" : "refresh"} />
        </button>
      </div>

      <div className="sheet">
        <span className="grab" />

        <div className="sh-head">
          <div>
            <h2>Verified pros</h2>
            <small>
              {pros === null
                ? "Looking for pros near you…"
                : `${pros.length} CNIC-verified ${pros.length === 1 ? "pro" : "pros"} in Karachi`}
            </small>
          </div>
          <Link className="ic sm" href="/book" aria-label="Book a service">
            <KIcon name="plus" />
          </Link>
        </div>

        {error && (
          <div className="note bad">
            <KIcon name="alert" />
            <p>
              <b>Couldn&rsquo;t load pros.</b> {error}
            </p>
          </div>
        )}

        {pros === null ? (
          <>
            <Skel h={68} />
            <Skel h={68} />
            <Skel h={68} />
          </>
        ) : pros.length === 0 ? (
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
          <div className="list">
            {pros.map((p) => (
              <Link key={p.id} className="pro-row card" href={`/providers/view/?id=${p.id}`}>
                <Ava name={proName(p)} src={p.avatar_url} verified />
                <div>
                  <b>{proName(p)}</b>
                  <small>
                    {p.service_areas?.length ? p.service_areas.slice(0, 2).join(" · ") : "Karachi"}
                  </small>
                  <Rate
                    value={p.rating_avg}
                    suffix={`${p.jobs_completed.toLocaleString("en-PK")} jobs`}
                  />
                </div>
                <KIcon name="chev-r" className="chev" />
              </Link>
            ))}
          </div>
        )}

        {/* Companies, below the pros. Nothing renders on an installation
            with no business accounts, which is every one of them today. */}
        {firms.length > 0 && (
          <>
            <div className="sh-head">
              <div>
                <h2>Service companies</h2>
                <small>
                  {firms.length} {firms.length === 1 ? "company" : "companies"} pinned on the map
                </small>
              </div>
            </div>
            <div className="list">
              {firms.map((f) => (
                <Link key={f.id} className="pro-row card" href={`/businesses/view/?id=${f.id}`}>
                  <span className="firm-mark" aria-hidden="true">
                    <KIcon name={categoryIcon(f.trades[0]?.icon ?? null)} />
                  </span>
                  <div>
                    <b>{businessName(f)}</b>
                    <span className="trades">
                      {/* The icons repeat what the pin shows; the names say
                          what they mean, since a pin cannot. */}
                      {f.trades.slice(0, 3).map((t) => (
                        <KIcon key={t.id} name={categoryIcon(t.icon)} />
                      ))}
                      <small>
                        {f.trades.length
                          ? f.trades.map((t) => t.name).join(" · ")
                          : "General work"}
                      </small>
                    </span>
                    <Rate
                      value={f.rating_avg}
                      suffix={`${f.team_size} on the team`}
                    />
                  </div>
                  <KIcon name="chev-r" className="chev" />
                </Link>
              ))}
            </div>
          </>
        )}

        {pros !== null && pros.length > 0 && (
          <div className="sh-cta">
            <div>
              <small>Visits from</small>
              <b>{from === null ? "On quote" : formatPKR(from)}</b>
            </div>
            <Link className="btn" href="/book">
              Book a service
            </Link>
          </div>
        )}

        {degraded && (
          <Pill tone="warn" icon="info" className="kg-self-center">
            Pro names unavailable
          </Pill>
        )}
      </div>

      <TabBar />
    </Screen>
  );
}
