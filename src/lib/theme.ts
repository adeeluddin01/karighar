"use client";

import { useCallback, useSyncExternalStore } from "react";

export const THEME_KEY = "karighar-theme";
export type Theme = "light" | "dark" | "system";

// Theme lives on <html data-theme>, stamped before paint by the script in
// src/app/layout.tsx. We read it straight off the DOM rather than mirroring it
// into state, so there's no hydration mismatch and no setState-in-effect:
// useSyncExternalStore serves the neutral value for the prerendered HTML and
// re-reads the real one once hydrated.
const THEME_EVENT = "karighar:themechange";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

/** Also listens to the device preference, which `system` follows. */
function subscribeDark(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  window.addEventListener(THEME_EVENT, onChange);
  mq.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    mq.removeEventListener("change", onChange);
  };
}

function readTheme(): Theme {
  const v = document.documentElement.getAttribute("data-theme");
  return v === "dark" || v === "light" ? v : "system";
}

function readDark(): boolean {
  const t = readTheme();
  return t === "dark" || (t === "system" && window.matchMedia(DARK_QUERY).matches);
}

function applyTheme(next: Theme) {
  if (next === "system") {
    try {
      localStorage.removeItem(THEME_KEY);
    } catch {
      // ignore
    }
    document.documentElement.removeAttribute("data-theme");
  } else {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
    document.documentElement.setAttribute("data-theme", next);
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** The stored choice ("system" when following the device) plus a setter. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  return [theme, useCallback((next: Theme) => applyTheme(next), [])] as const;
}

/**
 * Whether dark is actually *showing* — the explicit choice, or the device
 * preference when following it. Drives the Profile screen's on/off switch,
 * which has no third state.
 */
export function useDarkMode() {
  const dark = useSyncExternalStore(subscribeDark, readDark, () => false);
  const setDark = useCallback((on: boolean) => applyTheme(on ? "dark" : "light"), []);
  return [dark, setDark] as const;
}
