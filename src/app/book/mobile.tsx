"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Screen, Scroll, Tabs, TopBar } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { EmptyK, Pill, Shot, Skel, Well } from "@/components/kg/parts";
import { categoryIcon } from "@/components/kg/catalogIcons";
import { formatPKR } from "@/lib/money";
import type { Service, ServiceCategory } from "@/lib/types";
import { clsx } from "@/lib/clsx";
import { useLanguage } from "@/lib/i18n";

type Cat = ServiceCategory & { services: Service[] };

function BookInner() {
  const search = useSearchParams();
  const { t } = useLanguage();
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(search.get("q") ?? "");
  const [cat, setCat] = useState(search.get("cat") ?? "all");

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
      .filter((c) => c.services.length > 0);
  }, [cats, cat, query]);

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
            <Link className="btn sm" href="/book/custom" style={{ marginTop: 10 }}>
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
            <div className="svc-grid">
              {c.services.map((s) => (
                <Link key={s.id} className="svc-card" href={`/book/service/?id=${s.id}`}>
                  {/* The service's own photo when it has one, otherwise the
                      category's, otherwise the icon <Shot> draws underneath. */}
                  <Shot
                    src={s.image_url ?? c.image_url}
                    icon={categoryIcon(s.icon ?? c.icon)}
                  />
                  <b>{s.name}</b>
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
          <Link className="live" href="/book/custom" style={{ marginTop: 4 }}>
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
