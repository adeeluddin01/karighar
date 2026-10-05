import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
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
    { media: "(prefers-color-scheme: light)", color: "#0f8a7e" },
    { media: "(prefers-color-scheme: dark)", color: "#132a2e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Stamps the saved theme on <html> before any app code runs, so the Settings
// toggle doesn't flash the wrong palette. "system" stores nothing and lets the
// prefers-color-scheme rules in globals.css decide.
const THEME_SCRIPT = `try{var t=localStorage.getItem("karighar-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Script
          id="karighar-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
