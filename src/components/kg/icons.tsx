// The redesign ships its own hand-tuned 24px line icons as an inline SVG
// sprite (see `Karighar Redesign.html`) — these paths are that set, copied
// verbatim, plus a handful of extra glyphs the real app needs drawn to match.
// Rendering one sprite and referencing it with <use> is what the prototype
// does, and keeps every icon a single DOM node.
//
// Server-safe: no hooks, no "use client".

export const KG_ICONS = [
  "home",
  "cal",
  "map",
  "user",
  "search",
  "sliders",
  "bell",
  "heart",
  "star",
  "chev-l",
  "chev-r",
  "chev-d",
  "arrow",
  "phone",
  "chat",
  "shield",
  "pin",
  "clock",
  "wrench",
  "zap",
  "snow",
  "hammer",
  "brush",
  "spark",
  "cash",
  "wallet",
  "card",
  "check",
  "x",
  "nav",
  "info",
  "logout",
  "globe",
  "moon",
  "headset",
  "receipt",
  "edit",
  "alert",
  "flame",
  "plus",
  "send",
  "trash",
  "users",
  "briefcase",
  "history",
  "inbox",
  "camera",
  "refresh",
  "lock",
  "mail",
  "gear",
  "whatsapp",
  "doc",
] as const;

export type KIconName = (typeof KG_ICONS)[number];

/** Rendered once in the root layout; every <KIcon> points into it. */
export function KIconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
      <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20z"/><path d="M9.5 21.5v-7h5v7"/></symbol>
      <symbol id="i-cal" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/><path d="M8 15h.01M12 15h.01M16 15h.01"/></symbol>
      <symbol id="i-map" viewBox="0 0 24 24"><path d="M3 6.5 9 3.5l6 3 6-3v14l-6 3-6-3-6 3z"/><path d="M9 3.5v14M15 6.5v14"/></symbol>
      <symbol id="i-user" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7.5" r="4"/></symbol>
      <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.6-4.6"/></symbol>
      <symbol id="i-sliders" viewBox="0 0 24 24"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5"/></symbol>
      <symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15 6 8.5"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/></symbol>
      <symbol id="i-heart" viewBox="0 0 24 24"><path d="M19.5 13.5c1.4-1.4 2.5-3 2.5-5A5 5 0 0 0 17 3.5c-1.8 0-3.5 1-5 2.5-1.5-1.5-3.2-2.5-5-2.5a5 5 0 0 0-5 5c0 2 1.1 3.6 2.5 5L12 21z"/></symbol>
      <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></symbol>
      <symbol id="i-chev-l" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></symbol>
      <symbol id="i-chev-r" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></symbol>
      <symbol id="i-chev-d" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
      <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></symbol>
      <symbol id="i-phone" viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z"/></symbol>
      <symbol id="i-chat" viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2.5 21.5z"/><path d="M8 10h8M8 13.5h5"/></symbol>
      <symbol id="i-shield" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></symbol>
      <symbol id="i-pin" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></symbol>
      <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M12 6.5V12l3.5 2"/></symbol>
      <symbol id="i-wrench" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/></symbol>
      <symbol id="i-zap" viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H13z"/></symbol>
      <symbol id="i-snow" viewBox="0 0 24 24"><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/><path d="M12 2l-2 2M12 2l2 2M12 22l-2-2M12 22l2-2M2 12l2-2M2 12l2 2M22 12l-2-2M22 12l-2 2"/></symbol>
      <symbol id="i-hammer" viewBox="0 0 24 24"><path d="m15 12-8.5 8.5a2.1 2.1 0 1 1-3-3L12 9"/><path d="M17.6 15 22 10.6"/><path d="m20.9 11.7-1.2-1.2c-.6-.6-1-1.4-1-2.3v-.8L16 4.6A5.6 5.6 0 0 0 12.1 3H9l.9.8A6.2 6.2 0 0 1 12 8.4V10l2 2h2.5l2.3 1.9"/></symbol>
      <symbol id="i-brush" viewBox="0 0 24 24"><path d="m9.5 11.5 9-9a2.1 2.1 0 1 1 3 3l-9 9"/><path d="m8.5 10.5 5 5"/><path d="M8 12.5c-2.8 0-4.5 1.8-4.5 4.5 0 1.2-.8 2.3-2 2.5 2.2 1.8 6 1.5 7.5-.5 1-1.3 1.3-2.8.7-4"/></symbol>
      <symbol id="i-spark" viewBox="0 0 24 24"><path d="M11 3l1.9 5.6L18.5 10.5l-5.6 1.9L11 18l-1.9-5.6L3.5 10.5l5.6-1.9z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/></symbol>
      <symbol id="i-cash" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></symbol>
      <symbol id="i-wallet" viewBox="0 0 24 24"><path d="M19 7V5a1 1 0 0 0-1-1H5.5a2.5 2.5 0 0 0 0 5H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6.5"/><path d="M16 13.5h5v4h-5a2 2 0 0 1 0-4z"/></symbol>
      <symbol id="i-card" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>
      <symbol id="i-nav" viewBox="0 0 24 24"><path d="M3 11 22 2l-9 19-2-8z"/></symbol>
      <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M12 16v-4.5M12 8h.01"/></symbol>
      <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></symbol>
      <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.5 2.6 3.8 6 3.8 9.5s-1.3 6.9-3.8 9.5c-2.5-2.6-3.8-6-3.8-9.5S9.5 5.1 12 2.5z"/></symbol>
      <symbol id="i-moon" viewBox="0 0 24 24"><path d="M12 3a6.5 6.5 0 0 0 9 9 9 9 0 1 1-9-9z"/></symbol>
      <symbol id="i-headset" viewBox="0 0 24 24"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H3zM21 14h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h3zM3 14v-3a9 9 0 0 1 18 0v3"/></symbol>
      <symbol id="i-receipt" viewBox="0 0 24 24"><path d="M4 3h16v18l-2.7-1.5-2.6 1.5-2.7-1.5L9.4 21l-2.7-1.5L4 21z"/><path d="M8 8h8M8 12h8M8 16h5"/></symbol>
      <symbol id="i-edit" viewBox="0 0 24 24"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></symbol>
      <symbol id="i-alert" viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></symbol>
      <symbol id="i-flame" viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></symbol>
      <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
      <symbol id="i-send" viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></symbol>
      <symbol id="i-trash" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M5.5 6l1 14a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1l1-14"/><path d="M10 11v6M14 11v6"/></symbol>
      <symbol id="i-users" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7.5" r="3.5"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16.5 4.1a3.5 3.5 0 0 1 0 6.8"/></symbol>
      <symbol id="i-briefcase" viewBox="0 0 24 24"><rect x="2.5" y="7" width="19" height="13.5" rx="2.5"/><path d="M8.5 7V4.8A1.8 1.8 0 0 1 10.3 3h3.4a1.8 1.8 0 0 1 1.8 1.8V7"/><path d="M2.5 12.5h19"/></symbol>
      <symbol id="i-history" viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 3v4.5h4.5"/><path d="M12 7.5V12l3.5 2"/></symbol>
      <symbol id="i-inbox" viewBox="0 0 24 24"><path d="M2.5 13h5l1.5 2.5h6L16.5 13h5"/><path d="M4.6 5.2 2.5 13v5a1.5 1.5 0 0 0 1.5 1.5h16a1.5 1.5 0 0 0 1.5-1.5v-5l-2.1-7.8A1.5 1.5 0 0 0 17.9 4H6.1a1.5 1.5 0 0 0-1.5 1.2z"/></symbol>
      <symbol id="i-camera" viewBox="0 0 24 24"><path d="M22 18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2.5l1.6-2.4A1 1 0 0 1 9 4h6a1 1 0 0 1 .9.6L17.5 7H20a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.6"/></symbol>
      <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v5h-5"/></symbol>
      <symbol id="i-lock" viewBox="0 0 24 24"><rect x="3.5" y="10.5" width="17" height="11" rx="2.5"/><path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5"/></symbol>
      <symbol id="i-mail" viewBox="0 0 24 24"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 6.5 9 6.5 9-6.5"/></symbol>
      <symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 8.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.5 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></symbol>
      <symbol id="i-whatsapp" viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2.5 21.5z"/><path d="M8.6 9.2c0 3 2.2 5.2 5.2 5.2l1.1-1.6-1.9-.8-.9.9a4 4 0 0 1-1.9-1.9l.9-.9-.8-1.9z" fill="currentColor" stroke="none"/></symbol>
      <symbol id="i-doc" viewBox="0 0 24 24"><path d="M14 2.5H6.5A1.5 1.5 0 0 0 5 4v16a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 20V7.5z"/><path d="M14 2.5V7.5h5"/><path d="M8.5 13h7M8.5 17h5"/></symbol>
      </defs>
    </svg>
  );
}

/**
 * One icon from the sprite. `.i` carries the stroke styling (see
 * karighar-mobile.css); `xs` is the 14px variant used inline in text.
 */
export function KIcon({
  name,
  className,
  xs,
}: {
  name: KIconName;
  className?: string;
  xs?: boolean;
}) {
  return (
    <svg
      className={["i", xs && "xs", className].filter(Boolean).join(" ")}
      aria-hidden="true"
      focusable="false"
    >
      <use href={`#i-${name}`} />
    </svg>
  );
}
