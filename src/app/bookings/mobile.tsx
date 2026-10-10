"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRequireAuth } from "@/lib/useUser";
import { Screen, Scroll, Tabs } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { EmptyK, Pill, Skel, Well } from "@/components/kg/parts";
import { categoryIcon } from "@/components/kg/catalogIcons";
import { STATUS_PILL, isActiveJob, jobRef, whenLabel } from "@/components/kg/job";
import { formatPKR } from "@/lib/money";
import type { Job, Service, ServiceCategory } from "@/lib/types";
import { clsx } from "@/lib/clsx";

type Pane = "active" | "past";
type Enriched = Job & { proName?: string | null; icon?: string | null; rated?: boolean };

export default function BookingsScreen() {
  const { user, loading } = useRequireAuth("/bookings");
  const [jobs, setJobs] = useState<Enriched[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [pane, setPane] = useState<Pane>("active");

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const [{ data: rows }, { data: services }, { data: cats }, { count }] = await Promise.all([
        supabase
          .from("jobs")
          .select("*")
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("services").select("id,category_id"),
        supabase.from("service_categories").select("id,icon"),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("read", false),
      ]);
      const list = (rows as Job[]) ?? [];
      setUnread(count ?? 0);

      const svc = new Map(
        ((services as Pick<Service, "id" | "category_id">[]) ?? []).map((s) => [s.id, s.category_id])
      );
      const catIcon = new Map(
        ((cats as Pick<ServiceCategory, "id" | "icon">[]) ?? []).map((c) => [c.id, c.icon])
      );

      // Pro names and "already rated" flags, in one round-trip each.
      const proIds = [...new Set(list.map((j) => j.provider_id).filter((v): v is string => !!v))];
      const [{ data: pros }, { data: reviews }] = await Promise.all([
        proIds.length
          ? supabase.from("public_provider_profiles").select("id,full_name").in("id", proIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from("reviews")
          .select("job_id")
          .eq("customer_id", user.id),
      ]);
      const proName = new Map(
        ((pros as { id: string; full_name: string | null }[]) ?? []).map((p) => [p.id, p.full_name])
      );
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

  const shown = pane === "active" ? active : past;

  return (
    <Screen>
      <Scroll>
        <header className="hh">
          <h1>My bookings</h1>
          <Link
            className="ic"
            href="/notifications"
            aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
          >
            <KIcon name="bell" />
            {unread > 0 && <i className="ndot" />}
          </Link>
        </header>

        <div className="seg" role="tablist" aria-label="Bookings">
          <button
            type="button"
            role="tab"
            aria-selected={pane === "active"}
            className={clsx(pane === "active" && "sel")}
            onClick={() => setPane("active")}
          >
            Active <span>{active.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === "past"}
            className={clsx(pane === "past" && "sel")}
            onClick={() => setPane("past")}
          >
            Past <span>{past.length}</span>
          </button>
        </div>

        {loading || jobs === null ? (
          <div className="list">
            <Skel h={132} />
            <Skel h={132} />
          </div>
        ) : shown.length === 0 ? (
          <EmptyK
            icon={pane === "active" ? "cal" : "receipt"}
            title={pane === "active" ? "Nothing booked right now" : "No past bookings"}
            hint={
              pane === "active"
                ? "Book a plumber, electrician or AC technician in a couple of taps."
                : "Finished and cancelled bookings land here with their receipts."
            }
          >
            <Link className="btn sm" href="/book" style={{ marginTop: 10 }}>
              Book a service
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
                      {pill.label}
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
  const href = `/bookings/view/?id=${job.id}`;

  if (job.status === "en_route" || job.status === "arrived" || job.status === "in_progress") {
    return (
      <div className="bk-act">
        <Link className="btn sm dark" href={href}>
          Track live
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
          View booking
        </Link>
        <Link className="link mute" href={href}>
          Cancel
        </Link>
      </div>
    );
  }
  if (job.status === "created" || job.status === "bidding") {
    return (
      <div className="bk-act">
        <Link className="btn sm ghost" href={href}>
          {job.status === "bidding" ? "See quotes" : "View booking"}
        </Link>
        <Link className="link mute" href={href}>
          Cancel
        </Link>
      </div>
    );
  }
  if (job.status === "completed") {
    return (
      <div className="bk-act">
        <Link className="btn sm" href={href}>
          Pay now
        </Link>
      </div>
    );
  }
  if (job.status === "paid" && !job.rated) {
    return (
      <div className="bk-act">
        <Link className="btn sm" href={href}>
          Rate your pro
        </Link>
      </div>
    );
  }
  if (job.status === "paid" || job.status === "rated") {
    return (
      <div className="bk-act">
        <Link className="btn sm ghost" href="/book">
          Book again
        </Link>
        <Link className="link" href={href}>
          Receipt
        </Link>
      </div>
    );
  }
  return null;
}
