import type { Metadata } from "next";
import { ProseScreen, ProseSection } from "@/components/kg/Prose";
import { BRAND } from "@/lib/config";

export const metadata: Metadata = { title: "Terms of Service — KARIGHAR" };

export default function TermsPage() {
  return (
    <ProseScreen
      title="Terms of Service"
      updated="Last updated: 17 August 2026 · Placeholder — review with a lawyer before launch."
      back="/settings"
    >
      <ProseSection title="1. About KARIGHAR">
        {BRAND.legalName} (&ldquo;KARIGHAR&rdquo;, &ldquo;we&rdquo;) operates an online marketplace that connects
        customers in {BRAND.city} with independent service professionals (&ldquo;Pros&rdquo;) for home services.
        We are a platform; the service itself is provided by the Pro.
      </ProseSection>
      <ProseSection title="2. Accounts">
        You must provide accurate information and keep your account secure. You are responsible
        for activity under your account. Pros must pass identity (CNIC) verification before taking jobs.
      </ProseSection>
      <ProseSection title="3. Bookings & pricing">
        Fixed-price services are charged at the listed price; final amounts may vary after on-site
        inspection and will be confirmed before work proceeds. Custom jobs are priced by the Pro&apos;s
        accepted quote. Payment is currently <strong>cash on completion</strong>.
      </ProseSection>
      <ProseSection title="4. Commission">
        KARIGHAR charges Pros a commission on completed jobs. Commission is deducted from the Pro&apos;s
        earnings and reflected in their ledger.
      </ProseSection>
      <ProseSection title="5. Cancellations">
        Customers may cancel before a Pro starts work. Repeated no-shows or abusive behaviour by
        either party may result in suspension.
      </ProseSection>
      <ProseSection title="6. Conduct & safety">
        Users must behave lawfully and respectfully. Report any safety concern immediately via support.
        We may remove users who violate these terms.
      </ProseSection>
      <ProseSection title="7. Liability">
        KARIGHAR is not liable for the acts or omissions of independent Pros beyond our platform
        obligations and applicable law. Services are provided &ldquo;as is&rdquo; during this MVP period.
      </ProseSection>
      <ProseSection title="8. Contact">
        Questions? Email {BRAND.supportEmail}.
      </ProseSection>
    </ProseScreen>
  );
}
