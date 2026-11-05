"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { Screen, Scroll, Tabs } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { AlertsBell } from "@/components/kg/AlertsBell";
import { EmptyK, Pill, Skel, Well } from "@/components/kg/parts";
import { categoryIcon } from "@/components/kg/catalogIcons";
import { STATUS_PILL, STATUS_PILL_UR, isActiveJob, jobRef, whenLabel } from "@/components/kg/job";
import { fetchPublicPros } from "@/lib/providers";
import { useLanguage } from "@/lib/i18n";
import {
  DEFAULT_JOB_FILTERS,
  filterJobs,
  serviceOptions,
  type JobFilters,
  type ServiceOption,
} from "@/lib/jobFilters";
import { JobFilters as JobFiltersBar } from "@/components/JobFilters";
import { formatPKR } from "@/lib/money";
import type { Job, Service, ServiceCategory } from "@/lib/types";
import { clsx } from "@/lib/clsx";

type Pane = "active" | "past";
type Enriched = Job & { proName?: string | null; icon?: string | null; rated?: boolean };

export default function BookingsScreen() {
  const { user, loading } = useRequireAuth("/bookings");
  const { t, lang } = useLanguage();
  const [jobs, setJobs] = useState<Enriched[] | null>(null);
  const [pane, setPane] = useState<Pane>("active");
  const [services, setServices] = useState<ServiceOption[]>([]);
  // Same filters as the desktop bookings list. No status filter here — the
  // Active/Past panes already split by status.
  const [filters, setFilters] = useState<JobFilters>(DEFAULT_JOB_FILTERS);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const [{ data: rows }, { data: services }, { data: cats }] = await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("services").select("id,name,category_id"),
        supabase.from("service_categories").select("id,icon"),
      ]);
      const list = (rows as Job[]) ?? [];

      const svc = new Map(
        ((services as Pick<Service, "id" | "category_id">[]) ?? []).map((s) => [s.id, s.category_id])
      );
      setServices(
        ((services as Pick<Service, "id" | "name">[]) ?? []).map((s) => ({
          id: s.id,
          name: s.name,
        }))
      );
      const catIcon = new Map(
        ((cats as Pick<ServiceCategory, "id" | "icon">[]) ?? []).map((c) => [c.id, c.icon])
      );

      // Pro names and "already rated" flags, in one round-trip each.
      const proIds = [...new Set(list.map((j) => j.provider_id).filter((v): v is string => !!v))];
      const [pros, { data: reviews }] = await Promise.all([
        fetchPublicPros(supabase, { ids: proIds }),
        supabase
          .from("reviews")
          .select("job_id")
          .eq("customer_id", user.id),
      ]);
      const proName = new Map(pros.pros.map((p) => [p.id, p.full_name]));
      const ratedJobs = new Set(((reviews as { job_id: string }[]) ?? []).map((r) => r.job_id));

      setJobs(
        list.map((j) => ({
          ...j,
          proName: j.provider_id ? proName.get(j.provider_id) ?? null : null,
          icon: j.service_id ? catIcon.get(svc.get(j.service_id) ?? "") ?? null : null,
          rated: ratedJobs.has(j.id),
        }))
      );
    })();
  }, [user]);

  const { active, past } = useMemo(() => {
    const all = jobs ?? [];
    return {
      active: all.filter((j) => isActiveJob(j.status)),
      past: all.filter((j) => !isActiveJob(j.status)),
    };
  }, [jobs]);

  // Service options come from both panes, so switching panes never leaves
  // the selected service without an option.
  const svcOpts = useMemo(
    () => serviceOptions(jobs ?? [], services),
    [jobs, services]
  );
  const paneList = pane === "active" ? active : past;
  const shown = useMemo(
    () => filterJobs(paneList, filters),
    [paneList, filters]
  );

  return (
    <Screen>
      <Scroll>
        <header className="hh">
          <h1>{t("bookings.title")}</h1>
          <AlertsBell />
        </header>

        <div className="seg" role="tablist" aria-label="Bookings">
          <button
            type="button"
            role="tab"
            aria-selected={pane === "active"}
            className={clsx(pane === "active" && "sel")}
            onClick={() => setPane("active")}
          >
            {t("bookings.active")} <span>{active.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === "past"}
            className={clsx(pane === "past" && "sel")}
            onClick={() => setPane("past")}
          >
            {t("bookings.past")} <span>{past.length}</span>
          </button>
        </div>

        {jobs !== null && paneList.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <JobFiltersBar
              variant="kg"
              services={svcOpts.options}
              hasCustom={svcOpts.hasCustom}
              value={filters}
              onChange={setFilters}
            />
          </div>
        )}

        {loading || jobs === null ? (
          <div className="list">
            <Skel h={132} />
            <Skel h={132} />
          </div>
        ) : shown.length === 0 && paneList.length > 0 ? (
          <div className="list">
            <div className="card" style={{ textAlign: "center", padding: 20 }}>
              <p style={{ color: "var(--mute)" }}>{t("filters.noMatch")}</p>
              <button
                type="button"
                className="btn sm ghost"
                style={{ marginTop: 12 }}
                onClick={() => setFilters(DEFAULT_JOB_FILTERS)}
              >
                {t("filters.clear")}
              </button>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <EmptyK
            icon={pane === "active" ? "cal" : "receipt"}
            title={pane === "active" ? t("bookings.noActive") : t("bookings.noPast")}
            hint={
              pane === "active" ? t("bookings.noActiveHint") : t("bookings.noPastHint")
            }
          >
            <Link className="btn sm" href="/book" style={{ marginTop: 10 }}>
              {t("bookings.bookService")}
            </Link>
          </EmptyK>
        ) : (
          <div className="list">
            {shown.map((job) => {
              const pill = STATUS_PILL[job.status];
              return (
                <article key={job.id} className="bk card">
                  <div className="bk-top">
                    <Pill tone={pill.tone} live={pill.live} icon={pill.icon}>
                      {lang === "ur" ? STATUS_PILL_UR[job.status] : pill.label}
                    </Pill>
                    <small>{whenLabel(job)}</small>
                  </div>
                  <Link className="bk-mid" href={`/bookings/view/?id=${job.id}`}>
                    <Well icon={categoryIcon(job.icon)} />
                    <div>
                      <b>{job.title}</b>
                      <small>
                        {job.proName ? `${job.proName} · ` : ""}
                        {jobRef(job.id)}
                      </small>
                    </div>
                    <em>{job.price === null ? "On quote" : formatPKR(job.price)}</em>
                  </Link>
                  <Actions job={job} />
                </article>
              );
            })}
          </div>
        )}
      </Scroll>
      <Tabs />
    </Screen>
  );
}

/** The one or two things you'd actually do to a booking in this state. */
function Actions({ job }: { job: Enriched }) {
  const { t } = useLanguage();
  const href = `/bookings/view/?id=${job.id}`;

  if (job.status === "en_route" || job.status === "arrived" || job.status === "in_progress") {
    return (
      <div className="bk-act">
        <Link className="btn sm dark" href={href}>
          {t("bookings.ctaTrackLive")}
        </Link>
        <Link className="ic sm" href={href} aria-label="Call or message your pro">
          <KIcon name="phone" />
        </Link>
        <Link className="ic sm" href={href} aria-label="Messages">
          <KIcon name="chat" />
        </Link>
      </div>
    );
  }
  if (job.status === "assigned") {
    return (
      <div className="bk-act">
        <Link className="btn sm dark" href={href}>
          {t("bookings.ctaView")}
        </Link>
        <Link className="link mute" href={href}>
          {t("bookings.ctaCancel")}
        </Link>
      </div>
    );
  }
  if (job.status === "created" || job.status === "bidding") {
    return (
      <div className="bk-act">
        <Link className="btn sm ghost" href={href}>
          {job.status === "bidding" ? t("bookings.ctaQuotes") : t("bookings.ctaView")}
        </Link>
        <Link className="link mute" href={href}>
          {t("bookings.ctaCancel")}
        </Link>
      </div>
    );
  }
  if (job.status === "completed") {
    return (
      <div className="bk-act">
        <Link className="btn sm" href={href}>
          {t("bookings.ctaPayNow")}
        </Link>
      </div>
    );
  }
  if (job.status === "paid" && !job.rated) {
    return (
      <div className="bk-act">
        <Link className="btn sm" href={href}>
          {t("bookings.ctaRate")}
        </Link>
      </div>
    );
  }
  if (job.status === "paid" || job.status === "rated") {
    return (
      <div className="bk-act">
        <Link className="btn sm ghost" href="/book">
          {t("bookings.ctaBookAgain")}
        </Link>
        <Link className="link" href={href}>
          {t("bookings.ctaReceiptShort")}
        </Link>
      </div>
    );
  }
  return null;
}
