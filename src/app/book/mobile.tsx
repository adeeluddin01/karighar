"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Screen, Scroll, Tabs, TopBar } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { EmptyK, Pill, Skel, Well } from "@/components/kg/parts";
import { categoryIcon } from "@/components/kg/catalogIcons";
import { formatPKR } from "@/lib/money";
import type { Service, ServiceCategory } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { TechnicianBrowse } from "@/components/TechnicianBrowse";
import { useLanguage } from "@/lib/i18n";

type Cat = ServiceCategory & { services: Service[] };

function BookInner() {
  const search = useSearchParams();
  const { t } = useLanguage();
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(search.get("q") ?? "");
  const [cat, setCat] = useState(search.get("cat") ?? "all");
  // "What do I need?" vs "who do I want?" — two ways into the same booking.
  // ?tab=technicians so the home rail and a provider profile can link
  // straight here rather than landing on services and making people hunt.
  const [tab, setTab] = useState<"services" | "technicians">(
    search.get("tab") === "technicians" ? "technicians" : "services"
  );
  // Booking a named technician. This has to travel with EVERY onward link —
  // dropping it here is what made "Book Ahmed" quietly become "book anyone".
  const pro = search.get("pro");
  const withPro = (href: string) =>
    pro ? `${href}${href.includes("?") ? "&" : "?"}pro=${pro}` : href;
  const [proName, setProName] = useState<string | null>(null);
  const [proServices, setProServices] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!pro) return;
    const supabase = createClient();
    void (async () => {
      const [{ data: rows }, { data: profRow }] = await Promise.all([
        supabase.from("public_provider_services").select("service_id").eq("provider_id", pro),
        supabase.from("public_provider_profiles").select("full_name").eq("id", pro).maybeSingle(),
      ]);
      // A missing view (patch_v31 not run) leaves this null, which means
      // "don't filter" below rather than "this pro offers nothing".
      setProServices(
        rows ? new Set((rows as { service_id: string }[]).map((r) => r.service_id)) : null
      );
      setProName((profRow as { full_name: string | null } | null)?.full_name ?? null);
    })();
  }, [pro]);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [{ data: categories, error: e1 }, { data: services, error: e2 }] = await Promise.all([
        supabase.from("service_categories").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("services").select("*").eq("is_active", true),
      ]);
      if (e1 || e2) {
        setError(e1?.message || e2?.message || "Couldn't load services");
        setCats([]);
        return;
      }
      setCats(
        ((categories as ServiceCategory[]) ?? []).map((c) => ({
          ...c,
          services: ((services as Service[]) ?? []).filter((s) => s.category_id === c.id),
        }))
      );
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (cats ?? [])
      .filter((c) => cat === "all" || c.id === cat)
      .map((c) => ({
        ...c,
        services: q
          ? c.services.filter(
              (s) =>
                s.name.toLowerCase().includes(q) ||
                (s.description ?? "").toLowerCase().includes(q) ||
                c.name.toLowerCase().includes(q)
            )
          : c.services,
      }))
      .map((c) => ({
        ...c,
        // Restricted to the named pro's trades when booking one by name.
        services: proServices ? c.services.filter((s) => proServices.has(s.id)) : c.services,
      }))
      .filter((c) => c.services.length > 0);
  }, [cats, cat, query, proServices]);

  const count = filtered.reduce((n, c) => n + c.services.length, 0);

  return (
    <Screen>
      <TopBar
        title={t("book.title")}
        back="/"
        action={
          <Link className="ic" href="/support" aria-label={t("book.help")}>
            <KIcon name="info" />
          </Link>
        }
      />
      <Scroll underTop>
        <div className="chips" role="tablist" aria-label="Browse by">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "services"}
            className={clsx("chip", tab === "services" && "sel")}
            onClick={() => setTab("services")}
          >
            {t("book.tabService")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "technicians"}
            className={clsx("chip", tab === "technicians" && "sel")}
            onClick={() => setTab("technicians")}
          >
            {t("book.tabTechnician")}
          </button>
        </div>

        {/* Booking a named technician: say so, and give a way out. Without
            this the restricted service list just looks like a half-empty
            catalogue. */}
        {pro && tab === "services" && (
          <div className="note">
            <KIcon name="user" />
            <p>
              <b>
                {t("book.bookingNamed")} {proName ?? ""}.
              </b>{" "}
              {t("book.onlyTheirServices")}{" "}
              <Link href="/book" className="link">
                {t("book.browseEverything")}
              </Link>
            </p>
          </div>
        )}

        {tab === "technicians" ? (
          <div className="mt-3">
            <TechnicianBrowse categories={cats ?? []} compact />
          </div>
        ) : (
        <>
        <label className="in">
          <KIcon name="search" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("book.searchPlaceholder")}
            aria-label={t("book.searchLabel")}
          />
        </label>

        {cats && cats.length > 1 && (
          <div className="chips" role="tablist" aria-label={t("book.categories")}>
            <button
              type="button"
              role="tab"
              aria-selected={cat === "all"}
              className={clsx("chip", cat === "all" && "sel")}
              onClick={() => setCat("all")}
            >
              {t("book.all")}
            </button>
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={cat === c.id}
                className={clsx("chip", cat === c.id && "sel")}
                onClick={() => setCat(c.id)}
              >
                <KIcon name={categoryIcon(c.icon)} xs />
                {c.name}
              </button>
            ))}
          </div>
        )}

        {cats === null && (
          <>
            <Skel h={22} />
            <Skel h={140} />
            <Skel h={140} />
          </>
        )}

        {error && (
          <div className="note bad">
            <KIcon name="alert" />
            <p>
              <b>{error}</b> Check that <code>supabase/schema.sql</code> has been run and your keys
              are set in <code>.env.local</code>.
            </p>
          </div>
        )}

        {cats !== null && !error && filtered.length === 0 && (
          <EmptyK
            icon="search"
            title="No matches"
            hint={
              query
                ? `Nothing matches “${query}”. Try another word, or describe the job and get quotes.`
                : "No services are published yet."
            }
          >
            <Link className="btn sm" href={withPro("/book/custom")} style={{ marginTop: 10 }}>
              Post a custom job
            </Link>
          </EmptyK>
        )}

        {filtered.map((c) => (
          <section key={c.id} style={{ display: "contents" }}>
            <div className="sec">
              <h3>{c.name}</h3>
              <span style={{ fontWeight: 700, fontSize: 12, color: "var(--mute)" }}>
                {c.services.length} {c.services.length === 1 ? "service" : "services"}
              </span>
            </div>
            <div className="opts">
              {c.services.map((s) => (
                <Link key={s.id} className="opt" href={withPro(`/book/service/?id=${s.id}`)}>
                  <Well icon={categoryIcon(c.icon)} size="sm" />
                  <div>
                    <b>{s.name}</b>
                    <small>{s.description}</small>
                  </div>
                  <em>
                    {s.base_price === null ? (
                      "On quote"
                    ) : (
                      <>
                        {formatPKR(s.base_price)} <small>/{s.unit}</small>
                      </>
                    )}
                  </em>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {cats !== null && count > 0 && (
          <Link className="live" href={withPro("/book/custom")} style={{ marginTop: 4 }}>
            <Well icon="edit" size="sm" />
            <div>
              <b>Something else?</b>
              <small>Describe the job and nearby pros will send you quotes.</small>
            </div>
            <KIcon name="chev-r" />
          </Link>
        )}

        <div className="note">
          <KIcon name="shield" />
          <p>
            <b>{t("book.payAfter")}</b> {t("book.verifiedCopy")}
          </p>
        </div>
        <Pill tone="ok" icon="check" className="kg-self-center">
          {count} {count === 1 ? t("book.service") : t("book.servicesPlural")}{" "}
          {t("book.available")}
        </Pill>
        </>
        )}
      </Scroll>
      <Tabs />
    </Screen>
  );
}

export default function BookPage() {
  return (
    <Suspense
      fallback={
        <Screen>
          <Scroll>
            <Skel h={48} />
            <Skel h={160} />
          </Scroll>
          <Tabs />
        </Screen>
      }
    >
      <BookInner />
    </Suspense>
  );
}
