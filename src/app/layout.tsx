import type { Metadata, Viewport } from "next";
import { Urbanist, Manrope, Noto_Nastaliq_Urdu } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import { KIconSprite } from "@/components/kg/icons";
import { LanguageProvider } from "@/lib/i18n";

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

// Urdu renders in Noto Nastaliq Urdu (arabic subset — the latin subsets
// above carry no Urdu glyphs). Applied via `html[lang="ur"]` in
// globals.css, so English keeps Urbanist/Manrope exactly as before.
const notoNastaliqUrdu = Noto_Nastaliq_Urdu({
  variable: "--font-urdu",
  subsets: ["arabic"],
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

// Same pre-paint pattern as the theme: stamp lang + direction before any
// app code runs, so switching to Urdu doesn't flash English LTR first.
// "pref_urdu" is the old dead toggle's key — honoured once, so anyone who
// flipped it earlier gets Urdu instead of a silently ignored preference.
const LANG_SCRIPT = `try{var l=localStorage.getItem("karighar-lang");if(l!=="ur"&&l!=="en")l=localStorage.getItem("pref_urdu")==="1"?"ur":"en";document.documentElement.setAttribute("lang",l);document.documentElement.setAttribute("dir",l==="ur"?"rtl":"ltr")}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${urbanist.variable} ${manrope.variable} ${notoNastaliqUrdu.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Script
          id="karighar-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
        <Script
          id="karighar-lang"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }}
        />
        <KIconSprite />
        <LanguageProvider>
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
