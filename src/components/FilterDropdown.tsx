"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

// One dropdown button for the jobs filter bar, in two modes:
//  - multiple: a checkbox list that stays open until Done, backdrop tap,
//    or Escape, so several types can be picked in one go.
//  - single: tapping an option picks it and closes straight away.
// On phones the panel is a bottom sheet (fixed, full width, rounded top,
// scrollable, with a drag handle); on desktop it is an anchored popover
// under the button. A backdrop sits behind it, so it can never trap the
// map or the list underneath, and Escape always closes it.
export type FilterDropdownOption = { value: string; label: string };

export function FilterDropdown({
  label,
  allLabel,
  options,
  multiple = false,
  value,
  onChange,
  doneLabel,
}: {
  label: string;
  /** Shown when nothing is selected (multi) or as the fallback (single). */
  allLabel: string;
  options: FilterDropdownOption[];
  multiple?: boolean;
  /** Selected values. Single mode holds 0 or 1 entries. */
  value: string[];
  onChange: (next: string[]) => void;
  doneLabel: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const selected = options.filter((o) => value.includes(o.value));
  const summary = multiple
    ? selected.length === 0
      ? allLabel
      : selected.length === 1
        ? selected[0].label
        : label
    : (selected[0]?.label ?? allLabel);

  const toggle = (v: string) => {
    if (multiple) {
      onChange(
        value.includes(v) ? value.filter((x) => x !== v) : [...value, v]
      );
    } else {
      onChange([v]);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-3 text-start text-sm font-medium text-foreground shadow-sm"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{summary}</span>
          {multiple && selected.length > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
              {selected.length}
            </span>
          )}
        </span>
        <Icon
          name="chevron"
          size="sm"
          className={`shrink-0 text-muted-foreground transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
        />
      </button>

      {open && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            aria-multiselectable={multiple || undefined}
            aria-label={label}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-3xl border border-border bg-card shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:start-0 sm:top-full sm:mt-2 sm:max-h-80 sm:min-w-60 sm:w-full sm:rounded-2xl"
          >
            <div
              aria-hidden="true"
              className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden"
            />
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <span className="text-sm font-semibold text-foreground">{label}</span>
              {multiple && (
                <button
                  type="button"
                  className="text-sm font-semibold text-primary"
                  onClick={() => setOpen(false)}
                >
                  {doneLabel}
                </button>
              )}
            </div>
            {options.map((o) => {
              const active = value.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start text-sm text-foreground hover:bg-primary-light/60"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    {active && <Icon name="check" size="sm" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
