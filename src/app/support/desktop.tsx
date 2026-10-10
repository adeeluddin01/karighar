import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { BRAND } from "@/lib/config";

const FAQ = [
  [
    "How do I book a service?",
    "Tap Book, choose a service, pin your location, pick a time, and confirm. You pay cash after the job is done.",
  ],
  [
    "How are prices decided?",
    "Common services have fixed, upfront prices. For unusual jobs, post a custom job and Pros send you quotes.",
  ],
  [
    "Are the professionals verified?",
    "Yes — every Pro submits CNIC and a selfie and is approved by our team before taking jobs.",
  ],
  ["How do I pay?", "Currently cash on completion. Online payments are coming soon."],
  [
    "How do I become a Pro?",
    "Tap ‘Become a Pro’, complete your profile and verification, and start accepting jobs once approved.",
  ],
];

export default function SupportPage() {
  return (
    <AppShell width="narrow">
      <PageHeader
        title="Help &amp; Support"
        subtitle={`We're here to help — 9am to 9pm, every day.`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <a href={`mailto:${BRAND.supportEmail}`} className="opt">
          <span className="emoji">
            <Icon name="send" size="lg" className="text-accent-foreground" />
          </span>
          <span className="text-base font-bold">Email us</span>
          <span className="text-xs text-muted-foreground">{BRAND.supportEmail}</span>
        </a>
        <a href={BRAND.supportWhatsAppLink} target="_blank" rel="noopener" className="opt">
          <span className="emoji">
            <Icon name="chat" size="lg" className="text-accent-foreground" />
          </span>
          <span className="text-base font-bold">WhatsApp</span>
          <span className="text-xs text-muted-foreground">{BRAND.supportWhatsApp}</span>
        </a>
      </div>

      <h2 className="mt-10 mb-4 text-xl font-bold tracking-tight">FAQs</h2>
      <div className="flex flex-col gap-3">
        {FAQ.map(([q, a]) => (
          <Card key={q}>
            <p className="font-bold">{q}</p>
            <p className="mt-1 text-sm text-muted-foreground">{a}</p>
          </Card>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
      </p>
    </AppShell>
  );
}
