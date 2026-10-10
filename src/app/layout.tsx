import type { Metadata, Viewport } from "next";
import { Urbanist, Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { KIconSprite } from "@/components/kg/icons";

// The redesign's two faces: Urbanist for display (headings, money, stats),
// Manrope for body text. Both variable, so every weight 400–800 is available
// from one file each.
const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KARIGHAR — Verified home-service pros in Karachi",
  description:
    "Book verified plumbers, electricians and AC technicians in Karachi. Fixed prices, live tracking, satisfaction guaranteed.",
  applicationName: "KARIGHAR",
  appleWebApp: { capable: true, title: "KARIGHAR", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5f3" },
    { media: "(prefers-color-scheme: dark)", color: "#101a16" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Stamps the saved theme on <html> before any app code runs, so the Profile
// toggle doesn't flash the wrong palette. "system" stores nothing and lets the
// prefers-color-scheme rules in globals.css decide.
const THEME_SCRIPT = `try{var t=localStorage.getItem("karighar-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${urbanist.variable} ${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Script
          id="karighar-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
        <KIconSprite />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
