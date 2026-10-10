"use client";

import { useState } from "react";
import Link from "next/link";
import { Screen, Scroll, TopBar } from "@/components/kg/Screen";
import { KIcon } from "@/components/kg/icons";
import { Pill, Well } from "@/components/kg/parts";
import { BRAND } from "@/lib/config";
import { clsx } from "@/lib/clsx";

const FAQ: [string, string][] = [
  [
    "How do I book a service?",
    "Tap Book, choose a service, confirm where and when, and place the booking. You pay cash after the job is done.",
  ],
  [
    "How are prices decided?",
    "Common services have fixed, upfront prices you see before booking. For unusual jobs, post a custom job and pros send you quotes.",
  ],
  [
    "Are the professionals verified?",
    "Yes — every pro submits their CNIC and a selfie, and is approved by our team before they can take jobs.",
  ],
  [
    "How do I pay?",
    "Cash on completion. You confirm the payment in the app, then rate your pro. Wallets and cards are coming soon.",
  ],
  [
    "Something wasn't fixed properly — what now?",
    "Open the booking and tap Report an issue within 48 hours. We'll arrange a re-visit or a refund where it's warranted.",
  ],
  [
    "How do I become a pro?",
    "Open Profile, tap “Earn with Karighar”, complete your details and verification, and start accepting jobs once approved.",
  ],
];

export default function SupportScreen() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Screen>
      <TopBar title="Help &amp; support" />
      <Scroll underTop pad="plain">
        <div className="live">
          <Well icon="headset" size="sm" />
          <div>
            <b>We&rsquo;re open 9 am – 9 pm</b>
            <small>Every day, including weekends.</small>
          </div>
          <Pill tone="ok" live>
            Open
          </Pill>
        </div>

        <h3 className="lbl">Talk to us</h3>
        <div className="opts">
          <a className="opt" href={BRAND.supportWhatsAppLink} target="_blank" rel="noopener">
            <Well icon="whatsapp" size="sm" />
            <div>
              <b>WhatsApp</b>
              <small>{BRAND.supportWhatsApp} · usually replies in minutes</small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </a>
          <a className="opt" href={`tel:${BRAND.supportWhatsApp.replace(/\s/g, "")}`}>
            <Well icon="phone" size="sm" />
            <div>
              <b>Call us</b>
              <small>{BRAND.supportWhatsApp}</small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </a>
          <a className="opt" href={`mailto:${BRAND.supportEmail}`}>
            <Well icon="mail" size="sm" />
            <div>
              <b>Email</b>
              <small>{BRAND.supportEmail}</small>
            </div>
            <KIcon name="chev-r" className="chev" />
          </a>
        </div>

        <h3 className="lbl">Common questions</h3>
        <div className="menu card">
          {FAQ.map(([q, a], i) => (
            <button
              key={q}
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
            >
              <div>
                <b>{q}</b>
                {open === i && <small style={{ marginTop: 4 }}>{a}</small>}
              </div>
              <KIcon
                name="chev-d"
                className={clsx("chev", open === i && "kg-flip")}
              />
            </button>
          ))}
        </div>

        <div className="note">
          <KIcon name="shield" />
          <p>
            <b>Every pro is CNIC-verified</b> and you only pay once the work is done — that&rsquo;s
            the {BRAND.name} guarantee.
          </p>
        </div>

        <small style={{ textAlign: "center" }}>
          <Link href="/terms" className="link">
            Terms
          </Link>
          {" · "}
          <Link href="/privacy" className="link">
            Privacy
          </Link>
        </small>
      </Scroll>
    </Screen>
  );
}
