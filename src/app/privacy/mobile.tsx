import type { Metadata } from "next";
import { ProseScreen, ProseSection } from "@/components/kg/Prose";
import { BRAND } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy Policy — KARIGHAR" };

export default function PrivacyPage() {
  return (
    <ProseScreen
      title="Privacy Policy"
      updated="Last updated: 17 August 2026 · Placeholder — review with a lawyer before launch."
      back="/settings"
    >
      <ProseSection title="What we collect">
        Account details (name, phone, email), your service addresses and location (to match and
        route Pros), booking history, ratings, chat messages, and — for Pros — CNIC and a selfie
        for identity verification.
      </ProseSection>
      <ProseSection title="How we use it">
        To provide the service: match you with Pros, enable live tracking and chat, process
        bookings, prevent fraud, and improve KARIGHAR. Pro verification documents are used only to
        confirm identity and are stored privately.
      </ProseSection>
      <ProseSection title="Sharing">
        We share only what&apos;s necessary to complete a job (e.g. a Pro sees the job address and your
        name/phone once assigned). We do not sell your personal data.
      </ProseSection>
      <ProseSection title="Location">
        A Pro&apos;s live location is shared with the customer only while a job is active. Your address is
        shared with the assigned Pro only.
      </ProseSection>
      <ProseSection title="Security & retention">
        Data is stored securely with access controls. Verification images are kept in a private,
        restricted store. You may request deletion of your account and data.
      </ProseSection>
      <ProseSection title="Contact">
        Privacy questions? Email {BRAND.supportEmail}.
      </ProseSection>
    </ProseScreen>
  );
}
