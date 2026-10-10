"use client";

import { useUser } from "@/lib/useUser";
import { AppShell } from "@/components/AppShell";
import { Card, LinkButton, Pill } from "@/components/ui";
import { BRAND } from "@/lib/config";

const BENEFITS = [
  ["📋", "Get matched", "Receive nearby jobs that fit your skills and area."],
  ["💰", "Keep more", "Low commission (15–20%). Cash paid directly to you."],
  ["⭐", "Build a reputation", "Ratings help you win more, higher-value jobs."],
] as const;

export default function BecomeAProPage() {
  const { user, profile } = useUser();
  const isProvider = profile?.role === "provider";

  return (
    <AppShell>
      <section className="hero text-center">
        <Pill tone="gray" className="relative z-[1] bg-white/20 text-primary-foreground">
          For professionals
        </Pill>
        <h1 className="relative z-[1] mt-4 text-3xl font-extrabold tracking-tight md:text-4xl">
          Grow your business with {BRAND.name}
        </h1>
        <p className="relative z-[1] mx-auto mt-3 max-w-xl text-sm opacity-90">
          Get steady jobs from customers across {BRAND.city}. You keep most of every job — we only
          take a small commission when you get paid.
        </p>
        <div className="relative z-[1] mt-6 flex justify-center">
          {isProvider ? (
            <LinkButton href="/pro/dashboard" variant="ghost">
              Go to your dashboard
            </LinkButton>
          ) : user ? (
            <LinkButton href="/pro/onboarding" variant="ghost">
              Complete your pro profile
            </LinkButton>
          ) : (
            <LinkButton href="/signup?role=provider&next=/pro/onboarding" variant="ghost">
              Apply to become a pro
            </LinkButton>
          )}
        </div>
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {BENEFITS.map(([icon, title, desc]) => (
          <Card key={title}>
            <span className="emoji">{icon}</span>
            <h3 className="mt-3 text-base font-bold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        You&apos;ll need your CNIC and a selfie to get verified. Approval usually takes 1–2 days.
      </p>
    </AppShell>
  );
}
