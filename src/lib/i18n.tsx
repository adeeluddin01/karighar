"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { JobStatus } from "@/lib/types";

// App language: English (default) or Urdu. Urdu is RTL and renders in
// Noto Nastaliq Urdu (see layout.tsx + globals.css).
//
// Shape mirrors the theme preference in settings/desktop.tsx on purpose:
// the value lives on <html lang>/<html dir>, stamped before paint by the
// LANG_SCRIPT in layout.tsx so there is no flash, and useSyncExternalStore
// serves "en" for the prerendered HTML so hydration never mismatches.
//
// Storage key is "karighar-lang" ("en" | "ur"). The old dead toggle in
// Settings wrote "pref_urdu" ("1" | "0") and did nothing — a "1" there is
// honoured once on first read, so anyone who flipped it earlier gets Urdu
// instead of a silently ignored preference.

export type Lang = "en" | "ur";

export const LANG_KEY = "karighar-lang";
export const LANG_EVENT = "karighar:langchange";
const LEGACY_URDU_KEY = "pref_urdu";

type Entry = { en: string; ur: string };

// One flat dictionary. Keys are stable ids, NOT the English text, so a
// rewording in English doesn't silently orphan the Urdu. Anything not in
// here renders English — the rest of the app is translated screen by screen,
// and a missing key must never blank a label.
const STRINGS: Record<string, Entry> = {
  // ---- navigation (nav.ts labels, looked up by their English label) ----
  "nav:Home": { en: "Home", ur: "ہوم" },
  "nav:Book": { en: "Book", ur: "بک کریں" },
  "nav:Services": { en: "Services", ur: "سروسز" },
  "nav:Bookings": { en: "Bookings", ur: "بکنگز" },
  "nav:Alerts": { en: "Alerts", ur: "اطلاعات" },
  "nav:Profile": { en: "Profile", ur: "پروفائل" },
  "nav:Jobs": { en: "Jobs", ur: "کام" },
  "nav:Map": { en: "Map", ur: "نقشہ" },
  "nav:My Services": { en: "My Services", ur: "میری سروسز" },
  "nav:History": { en: "History", ur: "سابقہ کام" },
  "nav:Dispatch": { en: "Dispatch", ur: "ڈسپیچ" },
  "nav:Team": { en: "Team", ur: "ٹیم" },
  "nav:Earnings": { en: "Earnings", ur: "آمدنی" },
  "nav:Overview": { en: "Overview", ur: "جائزہ" },
  "nav:Providers": { en: "Providers", ur: "پروفیشنلز" },
  "nav:Pros": { en: "Pros", ur: "پروفیشنلز" },
  "nav:Businesses": { en: "Businesses", ur: "کاروبار" },
  "nav:Settlements": { en: "Settlements", ur: "حسابات" },
  "nav:Disputes": { en: "Disputes", ur: "تنازعات" },
  "nav:Catalog": { en: "Catalog", ur: "کیٹلاگ" },
  "nav:Become a Pro": { en: "Become a Pro", ur: "پرو بنیں" },
  "nav:Support": { en: "Support", ur: "مدد" },

  // ---- job status labels (JOB_STATUS_LABEL meanings) ----
  "status:created": { en: "Finding a pro", ur: "پرو تلاش جاری ہے" },
  "status:bidding": { en: "Collecting quotes", ur: "قیمتیں جمع ہو رہی ہیں" },
  "status:assigned": { en: "Pro assigned", ur: "پرو مقرر" },
  "status:en_route": { en: "On the way", ur: "راستے میں" },
  "status:arrived": { en: "Arrived", ur: "پہنچ گیا" },
  "status:in_progress": { en: "Work in progress", ur: "کام جاری ہے" },
  "status:completed": { en: "Completed", ur: "مکمل" },
  "status:paid": { en: "Paid", ur: "ادا شدہ" },
  "status:rated": { en: "Rated", ur: "ریٹنگ دی گئی" },
  "status:cancelled": { en: "Cancelled", ur: "منسوخ" },
  "status:disputed": { en: "Disputed", ur: "متنازع" },

  // ---- shared chrome ----
  "common.signIn": { en: "Sign in", ur: "سائن ان" },
  "common.signUp": { en: "Sign up", ur: "اکاؤنٹ بنائیں" },
  "common.signOut": { en: "Sign out", ur: "سائن آؤٹ" },
  "common.settings": { en: "Settings", ur: "سیٹنگز" },
  "common.profile": { en: "Profile", ur: "پروفائل" },
  "common.myBookings": { en: "My bookings", ur: "میری بکنگز" },
  "common.dashboard": { en: "Dashboard", ur: "ڈیش بورڈ" },
  "common.admin": { en: "Admin", ur: "ایڈمن" },
  "common.account": { en: "Account", ur: "اکاؤنٹ" },
  "common.close": { en: "Close", ur: "بند کریں" },
  "common.needHelp": { en: "Need help?", ur: "مدد چاہیے؟" },
  "common.callHours": { en: "Call us 9am – 9pm, every day.", ur: "روزانہ صبح 9 سے رات 9 بجے تک کال کریں۔" },
  "common.contactSupport": { en: "Contact support", ur: "سپورٹ سے رابطہ کریں" },
  "common.createAccount": { en: "Create account", ur: "اکاؤنٹ بنائیں" },

  // ---- job filters ----
  "filters.type": { en: "Job type", ur: "کام کی قسم" },
  "filters.typeAll": { en: "All types", ur: "تمام اقسام" },
  "filters.typeFixed": { en: "Fixed price", ur: "مقررہ قیمت" },
  "filters.typeCustom": { en: "Custom · quote", ur: "کسٹم · قیمت پر" },
  "filters.service": { en: "Service", ur: "سروس" },
  "filters.serviceAll": { en: "All services", ur: "تمام سروسز" },
  "filters.serviceCustom": { en: "Custom request", ur: "کسٹم درخواست" },
  "filters.sort": { en: "Sort", ur: "ترتیب" },
  "filters.sortNewest": { en: "Newest first", ur: "نیا پہلے" },
  "filters.sortPriceAsc": { en: "Price: low to high", ur: "قیمت: کم سے زیادہ" },
  "filters.sortPriceDesc": { en: "Price: high to low", ur: "قیمت: زیادہ سے کم" },
  "filters.sortSoonest": { en: "Soonest first", ur: "جلد از جلد" },
  "filters.status": { en: "Status", ur: "حیثیت" },
  "filters.statusAll": { en: "All statuses", ur: "تمام حیثیتیں" },
  "filters.clear": { en: "Clear filters", ur: "فلٹر صاف کریں" },
  "filters.noMatch": { en: "No jobs match these filters.", ur: "ان فلٹرز سے کوئی کام نہیں ملا۔" },

  // ---- pro dashboard ----
  "pro.open": { en: "Open", ur: "کھلے کام" },
  "pro.yourJobs": { en: "Your jobs", ur: "آپ کے کام" },
  "pro.openRequests": { en: "Open requests", ur: "کھلی درخواستیں" },
  "pro.activeJobs": { en: "Active jobs", ur: "جاری کام" },
  "pro.inPipeline": { en: "In pipeline", ur: "پائپ لائن میں" },
  "pro.owed": { en: "Owed to Karighar", ur: "کاریگر کو واجب" },
  "pro.dueBusiness": { en: "Due to your business", ur: "آپ کے کاروبار کو واجب" },
  "pro.accept": { en: "Accept", ur: "قبول کریں" },
  "pro.sendQuote": { en: "Send quote", ur: "قیمت بھیجیں" },
  "pro.atCap": { en: "At 3-job limit", ur: "3 کام کی حد" },
  "pro.customQuote": { en: "Custom · quote", ur: "کسٹم · قیمت پر" },
  "pro.newCustomer": { en: "New customer", ur: "نیا کسٹمر" },
  "pro.flexibleTime": { en: "Flexible time", ur: "لچکدار وقت" },
  "pro.nothingYet": { en: "Nothing here yet", ur: "یہاں کچھ نہیں" },
  "pro.noOpenHint": {
    en: "No open jobs right now. Check back soon.",
    ur: "ابھی کوئی کھلا کام نہیں۔ کچھ دیر بعد دوبارہ دیکھیں۔",
  },
  "pro.noMineHint": {
    en: "Jobs you accept will show up here.",
    ur: "جو کام آپ قبول کریں گے وہ یہاں نظر آئیں گے۔",
  },
  "pro.history": { en: "History", ur: "سابقہ کام" },
  "pro.jobsMap": { en: "Jobs map", ur: "کاموں کا نقشہ" },
  "pro.mapSubtitle": {
    en: "Green dots are your jobs, orange ones are up for grabs. Tap a dot for directions, or use the locate button to put yourself on the map.",
    ur: "سبز نشان آپ کے کام ہیں، نارنجی والے دستیاب ہیں۔ سمت کے لیے کسی نشان پر ٹیپ کریں۔",
  },
  "pro.noPinned": {
    en: "No jobs with a pinned location yet.",
    ur: "ابھی کسی کام کا مقام درج نہیں۔",
  },
  "pro.yours": { en: "Yours", ur: "آپ کا" },
  "pro.available": { en: "Available", ur: "دستیاب" },
  "pro.openInMaps": { en: "Open in Google Maps", ur: "گوگل میپس میں کھولیں" },
  "pro.showRoute": { en: "Show route here", ur: "یہاں راستہ دکھائیں" },
  "pro.openJob": { en: "Open job", ur: "کام کھولیں" },
  "pro.claimIt": { en: "Claim it", ur: "لے لیں" },
  "pro.yourActiveJob": { en: "Your active job", ur: "آپ کا جاری کام" },
  "pro.directions": { en: "Directions", ur: "سمت" },

  // ---- customer bookings ----
  "bookings.title": { en: "My bookings", ur: "میری بکنگز" },
  "bookings.subtitle": {
    en: "Everything you've booked, newest first.",
    ur: "آپ کی تمام بکنگز، نئی پہلے۔",
  },
  "bookings.bookService": { en: "Book a service", ur: "سروس بک کریں" },
  "bookings.none": { en: "No bookings yet", ur: "ابھی کوئی بکنگ نہیں" },
  "bookings.noneHint": {
    en: "Book a plumber, electrician or AC technician in a couple of taps.",
    ur: "چند ٹیپ میں پلمبر، الیکٹریشن یا اے سی ٹیکنیشن بک کریں۔",
  },
  "bookings.active": { en: "Active", ur: "جاری" },
  "bookings.past": { en: "Past", ur: "گزشتہ" },
  "bookings.noActive": { en: "Nothing booked right now", ur: "ابھی کچھ بک نہیں" },
  "bookings.noActiveHint": {
    en: "Book a plumber, electrician or AC technician in a couple of taps.",
    ur: "چند ٹیپ میں پلمبر، الیکٹریشن یا اے سی ٹیکنیشن بک کریں۔",
  },
  "bookings.noPast": { en: "No past bookings", ur: "کوئی گزشتہ بکنگ نہیں" },
  "bookings.noPastHint": {
    en: "Finished and cancelled bookings land here with their receipts.",
    ur: "مکمل اور منسوخ بکنگز رسیدوں سمیت یہاں آتی ہیں۔",
  },
  "bookings.ctaTrack": { en: "Track booking", ur: "بکنگ ٹریک کریں" },
  "bookings.ctaQuotes": { en: "See quotes", ur: "قیمتیں دیکھیں" },
  "bookings.ctaConfirmPaid": { en: "Confirm paid", ur: "ادائیگی کی تصدیق کریں" },
  "bookings.ctaRate": { en: "Rate your pro", ur: "پرو کو ریٹ کریں" },
  "bookings.ctaReceipt": { en: "View receipt", ur: "رسید دیکھیں" },
  "bookings.ctaTrackLive": { en: "Track live", ur: "لائیو ٹریک کریں" },
  "bookings.ctaView": { en: "View booking", ur: "بکنگ دیکھیں" },
  "bookings.ctaPayNow": { en: "Pay now", ur: "ابھی ادا کریں" },
  "bookings.ctaBookAgain": { en: "Book again", ur: "دوبارہ بک کریں" },
  "bookings.ctaReceiptShort": { en: "Receipt", ur: "رسید" },
  "bookings.ctaCancel": { en: "Cancel", ur: "منسوخ کریں" },
  "bookings.noTime": { en: "No time set", ur: "وقت مقرر نہیں" },
  "bookings.stranded": {
    en: "Awaiting payment for over 3 days — open the booking to confirm paid.",
    ur: "3 دن سے ادائیگی کا انتظار ہے — بکنگ کھول کر ادائیگی کی تصدیق کریں۔",
  },

  // ---- settings ----
  "settings.title": { en: "Settings", ur: "سیٹنگز" },
  "settings.subtitle": {
    en: "Preferences, account and legal.",
    ur: "ترجیحات، اکاؤنٹ اور قانونی معلومات۔",
  },
  "settings.languageDesc": {
    en: "Switch the app language to Urdu",
    ur: "ایپ کی زبان اردو میں بدلیں",
  },
};

function lookup(lang: Lang, key: string): string {
  const entry = STRINGS[key];
  if (!entry) return key;
  return lang === "ur" ? entry.ur : entry.en;
}

function subscribeLang(onChange: () => void) {
  window.addEventListener(LANG_EVENT, onChange);
  return () => window.removeEventListener(LANG_EVENT, onChange);
}

function readLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "ur" || saved === "en") return saved;
    // One-time migration from the old dead toggle.
    if (localStorage.getItem(LEGACY_URDU_KEY) === "1") return "ur";
  } catch {
    // Storage unavailable — fall through to English.
  }
  return "en";
}

function getServerLang(): Lang {
  return "en";
}

export type LanguageApi = {
  lang: Lang;
  setLang: (next: Lang) => void;
  /** Translate a dictionary key; falls back to the English text, never blank. */
  t: (key: string) => string;
  /** Translate a nav.ts label by its English text. */
  tNav: (label: string) => string;
  /** Translate a job status (JOB_STATUS_LABEL meanings). */
  tStatus: (status: JobStatus) => string;
};

const LanguageContext = createContext<LanguageApi>({
  lang: "en",
  setLang: () => {},
  t: (key) => lookup("en", key),
  tNav: (label) => lookup("en", `nav:${label}`),
  tStatus: (status) => lookup("en", `status:${status}`),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, readLang, getServerLang);

  const setLang = useCallback((next: Lang) => {
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Storage unavailable — the session still switches.
    }
    document.documentElement.setAttribute("lang", next);
    document.documentElement.setAttribute("dir", next === "ur" ? "rtl" : "ltr");
    window.dispatchEvent(new Event(LANG_EVENT));
  }, []);

  const api: LanguageApi = {
    lang,
    setLang,
    t: useCallback((key: string) => lookup(lang, key), [lang]),
    tNav: useCallback((label: string) => lookup(lang, `nav:${label}`), [lang]),
    tStatus: useCallback((status: JobStatus) => lookup(lang, `status:${status}`), [lang]),
  };

  return <LanguageContext.Provider value={api}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageApi {
  return useContext(LanguageContext);
}
