"use client";

import Link from "next/link";
import { useUser } from "@/lib/useUser";
import { Screen, Scroll, TopBar, Cta } from "@/components/kg/Screen";
import { KIcon, type KIconName } from "@/components/kg/icons";
import { Pill, Well } from "@/components/kg/parts";
import { BRAND } from "@/lib/config";

const BENEFITS: [KIconName, string, string][] = [
  ["nav", "Get matched", "Nearby jobs that fit your skills and the areas you cover."],
  ["cash", "Keep more", "Low commission (15–20%). Customers pay you cash directly."],
  ["star", "Build a reputation", "Ratings from real bookings win you more, bigger jobs."],
  ["shield", "Verified means trusted", "A CNIC check puts you ahead of the roadside competition."],
];

const STEPS: [string, string][] = [
  ["Apply", "Name, phone, the services you offer and the areas you work."],
  ["Verify", "Upload your CNIC and a selfie. Approval usually takes 1–2 days."],
  ["Start earning", "Accept jobs near you, get paid in cash, settle commission weekly."],
];

export default function BecomeAProScreen() {
  const { user, profile, providerStatus } = useUser();
  const approved = profile?.role === "provider" && providerStatus === "approved";
  const applied = profile?.role === "provider";

  const cta = approved
    ? { href: "/pro/dashboard", label: "Open dashboard" }
    : applied
      ? { href: "/pro/onboarding", label: "Finish verification" }
      : user
        ? { href: "/pro/onboarding", label: "Apply now" }
        : { href: "/signup?role=provider&next=/pro/onboarding", label: "Apply now" };

  return (
    <Screen>
      <TopBar title="For technicians" back="/profile" />
      <Scroll underTop pad="cta">
        <section className="hero">
          <div className="hero-top">
            <Pill tone="act" icon="wrench">
              Earn with {BRAND.name}
            </Pill>
          </div>
          <svg className="hero-ic" aria-hidden="true">
            <use href="#i-wrench" />
          </svg>
          <div>
            <h2>Grow your business in {BRAND.city}</h2>
            <p>
              Steady jobs from customers across the city. You keep most of every job — we only take a
              small commission once you&rsquo;ve been paid.
            </p>
            <div className="hero-stats">
              <div>
                <small>You keep</small>
                <b>80–85%</b>
              </div>
              <div>
                <small>Payment</small>
                <b>Cash</b>
              </div>
              <div>
                <small>Approval</small>
                <b>1–2 days</b>
              </div>
            </div>
          </div>
        </section>

        {applied && (
          <div className={approved ? "note" : "note warn"}>
            <KIcon name={approved ? "shield" : "clock"} />
            <p>
              {approved ? (
                <>
                  <b>You&rsquo;re verified.</b> Jobs near you are waiting in your dashboard.
                </>
              ) : (
                <>
                  <b>Your application is {providerStatus ?? "in progress"}.</b> Finish your
                  verification details and we&rsquo;ll review them.
                </>
              )}
            </p>
          </div>
        )}

        <h3 className="lbl">Why work with us</h3>
        <div className="opts">
          {BENEFITS.map(([icon, title, desc]) => (
            <div key={title} className="opt">
              <Well icon={icon} size="sm" />
              <div>
                <b>{title}</b>
                <small>{desc}</small>
              </div>
            </div>
          ))}
        </div>

        <h3 className="lbl">How to join</h3>
        <div className="menu card">
          {STEPS.map(([title, desc], i) => (
            <div key={title}>
              <Well size="sm">{i + 1}</Well>
              <div>
                <b>{title}</b>
                <small>{desc}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="note">
          <KIcon name="lock" />
          <p>
            <b>You&rsquo;ll need your CNIC and a selfie.</b> We only use them to confirm your
            identity, and they&rsquo;re stored privately.
          </p>
        </div>
      </Scroll>

      <Cta>
        <div>
          <small>Commission</small>
          <b>
            15–20% <span>per job</span>
          </b>
        </div>
        <Link className="btn" href={cta.href}>
          {cta.label}
          <KIcon name="arrow" />
        </Link>
      </Cta>
    </Screen>
  );
}
