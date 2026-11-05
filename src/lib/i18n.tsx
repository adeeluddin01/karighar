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
  "filters.done": { en: "Done", ur: "ٹھیک ہے" },
  "filters.button": { en: "Filters", ur: "فلٹرز" },
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
  "pro.submitQuote": { en: "Submit quote", ur: "قیمت جمع کرائیں" },
  "pro.yourQuote": { en: "Your quote", ur: "آپ کی قیمت" },
  "pro.quoteNote": {
    en: "Note (optional) — what's included",
    ur: "نوٹ (اختیاری) — کیا شامل ہے",
  },
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
  "settings.appearance": { en: "Appearance", ur: "ظاہری شکل" },
  "settings.themeHint": {
    en: "Choose a theme, or follow your device setting.",
    ur: "تھیم منتخب کریں یا اپنے آلے کی ترتیب استعمال کریں۔",
  },
  "settings.themeLight": { en: "Light", ur: "ہلکا" },
  "settings.themeDark": { en: "Dark", ur: "گہرا" },
  "settings.themeSystem": { en: "System", ur: "سسٹم" },
  "settings.preferences": { en: "Preferences", ur: "ترجیحات" },
  "settings.pushNotif": { en: "Push notifications", ur: "پش اطلاعات" },
  "settings.pushNotifDesc": {
    en: "Job updates & messages",
    ur: "کام کی اپڈیٹس اور پیغامات",
  },
  "settings.workWithUs": { en: "Work with us", ur: "ہمارے ساتھ کام کریں" },
  "settings.proDashboard": { en: "Pro dashboard", ur: "پرو ڈیش بورڈ" },
  "settings.proDashboardHint": {
    en: "Your jobs, earnings and commission",
    ur: "آپ کے کام، آمدنی اور کمیشن",
  },
  "settings.finishVerification": {
    en: "Finish pro verification",
    ur: "پرو تصدیق مکمل کریں",
  },
  "settings.becomePro": { en: "Become a pro", ur: "پرو بنیں" },
  "settings.becomeProHint": {
    en: "Get matched to jobs near you and keep 80–85% of each one",
    ur: "اپنے قریب کے کام حاصل کریں اور ہر کام کا 80–85% رکھیں",
  },
  "settings.application": { en: "Application", ur: "درخواست" },
  "settings.inProgress": { en: "in progress", ur: "جاری ہے" },
  "settings.statusPending": { en: "pending", ur: "زیرِ غور" },
  "settings.statusSuspended": { en: "suspended", ur: "معطل" },
  "settings.statusRejected": { en: "rejected", ur: "مسترد" },
  "settings.account": { en: "Account", ur: "اکاؤنٹ" },
  "settings.email": { en: "Email", ur: "ای میل" },
  "settings.changePassword": { en: "Change password", ur: "پاس ورڈ بدلیں" },
  "settings.resetLinkHint": {
    en: "We'll email you a reset link",
    ur: "ہم آپ کو ری سیٹ لنک ای میل کریں گے",
  },
  "settings.resetLinkSent": {
    en: "Password reset link sent to your email.",
    ur: "پاس ورڈ ری سیٹ لنک آپ کے ای میل پر بھیج دیا گیا ہے۔",
  },
  "settings.logOut": { en: "Log out", ur: "لاگ آؤٹ" },
  "settings.about": { en: "About", ur: "متعلق" },
  "settings.aboutLegal": { en: "About & legal", ur: "متعلق اور قانونی" },
  "settings.helpSupport": { en: "Help & Support", ur: "مدد اور سپورٹ" },
  "settings.terms": { en: "Terms", ur: "شرائط" },
  "settings.termsOfService": { en: "Terms of service", ur: "سروس کی شرائط" },
  "settings.privacy": { en: "Privacy", ur: "پرائیویسی" },
  "settings.privacyPolicy": { en: "Privacy policy", ur: "پرائیویسی پالیسی" },

  // ---- pro view toggle (map page only) ----
  "pro.listView": { en: "List view", ur: "فہرست" },
  "pro.mapView": { en: "Map view", ur: "نقشہ" },

  // ---- pro services (My Services tab) ----
  // Category and area names stay as entered (database / list data), like
  // service names everywhere else — only the chrome is translated.
  "services.title": { en: "My services", ur: "میری سروسز" },
  "services.subtitle": {
    en: "Choose what you offer and where you work.",
    ur: "منتخب کریں کہ آپ کیا پیش کرتے ہیں اور کہاں کام کرتے ہیں۔",
  },
  "services.offer": { en: "Services you offer", ur: "وہ سروسز جو آپ پیش کرتے ہیں" },
  "services.areas": { en: "Areas you cover", ur: "وہ علاقے جنہیں آپ کور کرتے ہیں" },
  "services.selected": { en: "selected", ur: "منتخب" },
  "services.loading": { en: "Loading…", ur: "لوڈ ہو رہا ہے…" },

  // ---- provider application status (Profile pill) ----
  "status.approved": { en: "Approved", ur: "منظور شدہ" },
  "status.pending": { en: "Pending", ur: "زیرِ غور" },
  "status.suspended": { en: "Suspended", ur: "معطل" },
  "status.rejected": { en: "Rejected", ur: "مسترد" },

  // ---- profile (desktop + mobile) ----
  "profile.title": { en: "Your profile", ur: "آپ کی پروفائل" },
  "profile.roleCustomer": { en: "Customer", ur: "کسٹمر" },
  "profile.roleProvider": { en: "Provider", ur: "پرو" },
  "profile.roleBusiness": { en: "Business", ur: "بزنس" },
  "profile.roleAdmin": { en: "Admin", ur: "ایڈمن" },
  "profile.changePhoto": { en: "Change photo", ur: "تصویر تبدیل کریں" },
  "profile.addPhoto": { en: "Add a photo", ur: "تصویر شامل کریں" },
  "profile.uploading": { en: "Uploading…", ur: "اپ لوڈ ہو رہی ہے…" },
  "profile.remove": { en: "Remove", ur: "ہٹائیں" },
  "profile.yourRatingCustomer": { en: "Your rating as a customer", ur: "بطور کسٹمر آپ کی ریٹنگ" },
  "profile.ratingsReceived": { en: "Ratings received", ur: "موصول شدہ ریٹنگز" },
  "profile.ratingsHint": {
    en: "Left by the pros who did your jobs. Pros see this before accepting.",
    ur: "ان پروفیشنلز کی طرف سے جنہوں نے آپ کے کام کیے۔ پرو قبول کرنے سے پہلے یہ دیکھتے ہیں۔",
  },
  "profile.rating": { en: "Rating", ur: "ریٹنگ" },
  "profile.jobsCompleted": { en: "Jobs completed", ur: "مکمل شدہ کام" },
  "profile.fullName": { en: "Full name", ur: "پورا نام" },
  "profile.phone": { en: "Phone", ur: "فون" },
  "profile.email": { en: "Email", ur: "ای میل" },
  "profile.emailHint": { en: "Email can't be changed here.", ur: "ای میل یہاں تبدیل نہیں ہو سکتی۔" },
  "profile.saveChanges": { en: "Save changes", ur: "تبدیلیاں محفوظ کریں" },
  "profile.saving": { en: "Saving…", ur: "محفوظ ہو رہا ہے…" },
  "profile.saved": { en: "Saved", ur: "محفوظ ہو گیا" },
  "profile.teamCount": { en: "Technicians on your team", ur: "آپ کی ٹیم کے ٹیکنیشن" },
  "profile.jobsDispatched": { en: "Jobs dispatched", ur: "بھیجے گئے کام" },
  "profile.savedAddress": { en: "Saved address", ur: "محفوظ شدہ پتہ" },
  "profile.addAddressHint": {
    en: "Add the address we should send pros to",
    ur: "وہ پتہ شامل کریں جہاں ہم پرو بھیجیں",
  },
  "profile.savedAddressHint": {
    en: "Where we send pros by default. You can still change it per booking.",
    ur: "جہاں ہم بطورِ ڈیفالٹ پرو بھیجتے ہیں۔ آپ ہر بکنگ پر اسے تبدیل کر سکتے ہیں۔",
  },
  "profile.area": { en: "Area", ur: "علاقہ" },
  "profile.addressLine": { en: "House / flat, street, landmark", ur: "مکان / فلیٹ، گلی، نشانی" },
  "profile.dropPin": { en: "Drop a pin", ur: "پن لگائیں" },
  "profile.dropPinHint": {
    en: "Optional, but it gets the pro to your door instead of your street.",
    ur: "اختیاری ہے، لیکن اس سے پرو آپ کے دروازے تک پہنچتا ہے، گلی تک نہیں۔",
  },
  "profile.saveAddress": { en: "Save address", ur: "پتہ محفوظ کریں" },
  "profile.yourTeam": { en: "Your team", ur: "آپ کی ٹیم" },
  "profile.earningsCommission": { en: "Earnings & commission", ur: "آمدنی اور کمیشن" },
  "profile.manageServices": { en: "Manage my services & areas", ur: "میری سروسز اور علاقے منظم کریں" },
  "profile.viewVerification": { en: "View my verification details", ur: "میری تصدیق کی تفصیل دیکھیں" },
  "profile.allReviews": { en: "All reviews", ur: "تمام جائزے" },
  "profile.myRatings": { en: "My ratings", ur: "میری ریٹنگز" },
  "profile.saveDetailsError": { en: "Couldn't save your details — ", ur: "تفصیل محفوظ نہیں ہو سکی — " },
  "profile.saveAddressError": { en: "Couldn't save your address — ", ur: "پتہ محفوظ نہیں ہو سکا — " },
  "profile.savePictureError": { en: "Couldn't save your picture — ", ur: "تصویر محفوظ نہیں ہو سکی — " },
  "profile.removePictureError": { en: "Couldn't remove your picture — ", ur: "تصویر ہٹائی نہیں جا سکی — " },
  "profile.pictureUpdated": { en: "Profile picture updated.", ur: "پروفائل تصویر اپ ڈیٹ ہو گئی۔" },
  "profile.pictureRemoved": { en: "Profile picture removed.", ur: "پروفائل تصویر ہٹا دی گئی۔" },
  "profile.addressSaved": { en: "Address saved.", ur: "پتہ محفوظ ہو گیا۔" },
  "profile.profileUpdated": { en: "Profile updated", ur: "پروفائل اپ ڈیٹ ہو گئی" },
  "profile.saveError": { en: "Couldn't save — ", ur: "محفوظ نہیں ہو سکا — " },
  "profile.memberSince": { en: "member since", ur: "سے رکن" },
  "profile.onTheTeam": { en: "On the team", ur: "ٹیم میں" },
  "profile.dispatched": { en: "Dispatched", ur: "بھیجے گئے" },
  "profile.dispatcher": { en: "Dispatcher", ur: "ڈسپیچر" },
  "profile.jobsDone": { en: "Jobs done", ur: "مکمل کام" },
  "profile.proRating": { en: "Pro rating", ur: "پرو ریٹنگ" },
  "profile.new": { en: "New", ur: "نیا" },
  "profile.asTechnician": { en: "As a technician", ur: "بطور ٹیکنیشن" },
  "profile.bookings": { en: "Bookings", ur: "بکنگز" },
  "profile.completed": { en: "Completed", ur: "مکمل" },
  "profile.yourRating": { en: "Your rating", ur: "آپ کی ریٹنگ" },
  "profile.notRatedYet": { en: "Not rated yet", ur: "ابھی ریٹنگ نہیں ملی" },
  "profile.forTechnicians": { en: "For technicians", ur: "ٹیکنیشنز کے لیے" },
  "profile.openProDashboard": { en: "Open your pro dashboard", ur: "اپنا پرو ڈیش بورڈ کھولیں" },
  "profile.earnWith": { en: "Earn with KARIGHAR", ur: "KARIGHAR کے ساتھ کمائیں" },
  "profile.proDashboardHint": {
    en: "Jobs near you, your earnings and what you owe in commission.",
    ur: "آپ کے قریب کام، آپ کی آمدنی اور کمیشن میں کیا واجب ہے۔",
  },
  "profile.earnHint": {
    en: "Get matched to jobs near you and keep 80–85% of every job. CNIC and a selfie to verify, approval in 1–2 days.",
    ur: "اپنے قریب کے کاموں سے جڑیں اور ہر کام کا 80–85% رکھیں۔ تصدیق کے لیے CNIC اور سیلفی، منظوری 1–2 دن میں۔",
  },
  "profile.account": { en: "Account", ur: "اکاؤنٹ" },
  "profile.services": { en: "Services", ur: "سروسز" },
  "profile.servicesHint": { en: "Trades and areas your team covers", ur: "وہ پیشے اور علاقے جنہیں آپ کی ٹیم کور کرتی ہے" },
  "profile.teamHint": { en: "Invite and manage technicians", ur: "ٹیکنیشنز کو مدعو کریں اور منظم کریں" },
  "profile.earningsHint": {
    en: "What your team owes you, and what you owe us",
    ur: "آپ کی ٹیم آپ کی کیا مقروض ہے، اور آپ ہمارے کیا مقروض ہیں",
  },
  "profile.pastJobsEarnings": { en: "Past jobs & earnings", ur: "پچھلے کام اور آمدنی" },
  "profile.pastJobsHint": {
    en: "Completed and paid jobs, and what you owe",
    ur: "مکمل اور ادا شدہ کام، اور آپ کا کیا واجب ہے",
  },
  "profile.servicesCoverHint": { en: "Trades and areas you cover", ur: "وہ پیشے اور علاقے جنہیں آپ کور کرتے ہیں" },
  "profile.verificationHint": { en: "Your application and documents", ur: "آپ کی درخواست اور دستاویزات" },
  "profile.bookingsReceipts": { en: "Bookings & receipts", ur: "بکنگز اور رسیدیں" },
  "profile.yourHistory": { en: "Your history", ur: "آپ کی تاریخ" },
  "profile.allReviewsHint": { en: "Every review on the platform", ur: "پلیٹ فارم پر ہر جائزہ" },
  "profile.myRatingsHint": { en: "Who rated you, and who you rated", ur: "کس نے آپ کو ریٹ کیا، اور آپ نے کس کو ریٹ کیا" },
  "profile.paymentMethods": { en: "Payment methods", ur: "ادائیگی کے طریقے" },
  "profile.paymentHint": {
    en: "Cash on completion · wallets coming soon",
    ur: "کام مکمل ہونے پر نقد · والیٹ جلد آ رہے ہیں",
  },
  "profile.cash": { en: "Cash", ur: "نقد" },
  "profile.language": { en: "Language", ur: "زبان" },
  "profile.darkTheme": { en: "Dark theme", ur: "ڈارک تھیم" },
  "profile.darkThemeHint": {
    en: "Follows your device unless you choose here",
    ur: "جب تک آپ یہاں منتخب نہ کریں، آپ کے ڈیوائس کی پیروی کرتا ہے",
  },
  "profile.support": { en: "Support", ur: "مدد" },
  "profile.helpSupport": { en: "Help & support", ur: "مدد اور سپورٹ" },
  "profile.helpHint": {
    en: "9 am – 9 pm, every day · WhatsApp or call",
    ur: "صبح 9 – رات 9، ہر روز · واٹس ایپ یا کال",
  },
  "profile.notifications": { en: "Notifications", ur: "اطلاعات" },
  "profile.notificationsHint": { en: "Job updates and messages", ur: "کام کی اپ ڈیٹس اور پیغامات" },
  "profile.termsPrivacy": { en: "Terms & privacy", ur: "شرائط اور پرائیویسی" },
  "profile.yourDetails": { en: "Your details", ur: "آپ کی تفصیل" },
  "profile.detailsHint": {
    en: "This is what your pro sees when a job is assigned.",
    ur: "جب کام تفویض ہوتا ہے تو آپ کا پرو یہی دیکھتا ہے۔",
  },
  "profile.changePicture": { en: "Change profile picture", ur: "پروفائل تصویر تبدیل کریں" },
  "profile.addPicture": { en: "Add a profile picture", ur: "پروفائل تصویر شامل کریں" },
  "profile.editProfile": { en: "Edit profile", ur: "پروفائل میں ترمیم کریں" },
};

function lookup(lang: Lang, key: string): string {
  const entry = STRINGS[key];
  if (!entry) return key;
  return lang === "ur" ? entry.ur : entry.en;
}

// proEntry() (components/nav.ts) returns plain English copy. Settings
// renders it, so it gets translated here — keyed by href, since that is
// what distinguishes the three entries. Anything unrecognised passes
// through in English rather than blanking.
export type ProEntry = { href: string; label: string; hint: string };

export function translateProEntry(
  lang: Lang,
  entry: ProEntry | null,
  providerStatus?: string | null
): ProEntry | null {
  if (!entry) return null;
  switch (entry.href) {
    case "/pro/dashboard":
      return {
        href: entry.href,
        label: lookup(lang, "settings.proDashboard"),
        hint: lookup(lang, "settings.proDashboardHint"),
      };
    case "/pro/onboarding": {
      const status =
        providerStatus === "pending"
          ? lookup(lang, "settings.statusPending")
          : providerStatus === "suspended"
            ? lookup(lang, "settings.statusSuspended")
            : providerStatus === "rejected"
              ? lookup(lang, "settings.statusRejected")
              : providerStatus ?? lookup(lang, "settings.inProgress");
      return {
        href: entry.href,
        label: lookup(lang, "settings.finishVerification"),
        hint: `${lookup(lang, "settings.application")} ${status}`,
      };
    }
    case "/pro":
      return {
        href: entry.href,
        label: lookup(lang, "settings.becomePro"),
        hint: lookup(lang, "settings.becomeProHint"),
      };
    default:
      return entry;
  }
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
  /** Translate a provider application status (approved/pending/suspended/rejected). */
  tProviderStatus: (status: string) => string;
  /** Translate a proEntry() card (Settings, Profile). */
  tPro: (entry: ProEntry | null, providerStatus?: string | null) => ProEntry | null;
};

const LanguageContext = createContext<LanguageApi>({
  lang: "en",
  setLang: () => {},
  t: (key) => lookup("en", key),
  tNav: (label) => lookup("en", `nav:${label}`),
  tStatus: (status) => lookup("en", `status:${status}`),
  tProviderStatus: (status) =>
    STRINGS[`status.${status}`] ? lookup("en", `status.${status}`) : status,
  tPro: (entry, providerStatus) => translateProEntry("en", entry, providerStatus),
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
    // Unknown statuses fall through to the raw value — lookup() returns
    // the key itself when there is no entry, and `status.${status}` has
    // no entry for anything outside the four known ones.
    tProviderStatus: useCallback(
      (status: string) => {
        const key = `status.${status}`;
        return STRINGS[key] ? lookup(lang, key) : status;
      },
      [lang]
    ),
    tPro: useCallback(
      (entry: ProEntry | null, providerStatus?: string | null) =>
        translateProEntry(lang, entry, providerStatus),
      [lang]
    ),
  };

  return <LanguageContext.Provider value={api}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageApi {
  return useContext(LanguageContext);
}
