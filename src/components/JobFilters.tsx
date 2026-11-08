"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import {
  DEFAULT_JOB_FILTERS,
  SERVICE_CUSTOM,
  isDefaultFilters,
  type JobFilters,
  type JobSort,
  type ServiceOption,
} from "@/lib/jobFilters";
import type { JobStatus, JobType } from "@/lib/types";
import { FilterDropdown } from "@/components/FilterDropdown";
import { Icon } from "@/components/Icon";
import { clsx } from "@/lib/clsx";

/** How many filters are active — the number in the Filter button's badge. */
export function activeFilterCount(value: JobFilters): number {
  return (
    value.types.length +
    (value.serviceId !== "all" ? 1 : 0) +
    (value.sort !== "newest" ? 1 : 0) +
    (value.status !== "all" ? 1 : 0)
  );
}

/**
 * The Filter toggle on its own, for sitting in a header row next to other
 * buttons — the pro jobs list puts it beside History.
 *
 * Styled `btn-ghost btn-sm`, matching LinkButton, rather than reusing the
 * standalone bar's chunkier button: next to a small ghost button the padded
 * card-and-border treatment reads as a different kind of control.
 *
 * The panel is NOT rendered here. Whoever places this owns the open state and
 * renders <JobFilters showTrigger={false}> full-width below, so expanding the
 * controls cannot stretch the header row.
 */
export function JobFiltersButton({
  value,
  open,
  onToggle,
  className,
}: {
  value: JobFilters;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const { t } = useLanguage();
  const count = activeFilterCount(value);
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={clsx("btn-ghost btn-sm", className)}
    >
      <Icon name="filter" size="sm" />
      {t("filters.button")}
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
          {count}
        </span>
      )}
      <Icon
        name="chevron"
        size="sm"
        className={`text-muted-foreground transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
      />
    </button>
  );
}

// One filter bar for every jobs list. The controls are the same everywhere:
// type (multi-select), service, sort, and (where it applies) status — so a
// pro sees the same filters on the dashboard list and the map, and a
// customer sees them on bookings.
//
// The controls hide behind a Filter button and open on tap: the bar stays
// one compact row when closed, with a badge counting the active filters, so
// the page keeps its space for the jobs and the map. `layout="stack"` lays
// the controls out one per row, full width — that is the list views
// (dashboard, map List area); the map view and the phone bookings screen
// use the wrapped row. Same state, same options, same labels either way.
export function JobFilters({
  services,
  hasCustom,
  value,
  onChange,
  statusOptions,
  variant = "legacy",
  layout = "row",
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: {
  services: ServiceOption[];
  hasCustom: boolean;
  value: JobFilters;
  onChange: (next: JobFilters) => void;
  /** Statuses present in the list. Omit where a status filter makes no sense. */
  statusOptions?: JobStatus[];
  variant?: "legacy" | "kg";
  /** "row": wrapped columns. "stack": one control per row, full width. */
  layout?: "row" | "stack";
  /** Lift the open state out when the trigger lives elsewhere (see below). */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /**
   * False when the caller renders its own <JobFiltersButton> — the pro jobs
   * list, which puts the trigger up in the header row next to History and
   * keeps only the panel here.
   */
  showTrigger?: boolean;
}) {
  const { t, tStatus } = useLanguage();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const showClear = !isDefaultFilters(value);
  const activeCount = activeFilterCount(value);

  const typeControl = (
    <FilterDropdown
      label={t("filters.type")}
      allLabel={t("filters.typeAll")}
      multiple
      options={[
        { value: "fixed", label: t("filters.typeFixed") },
        { value: "custom", label: t("filters.typeCustom") },
      ]}
      value={value.types}
      onChange={(types) => onChange({ ...value, types: types as JobType[] })}
      doneLabel={t("filters.done")}
    />
  );

  const serviceControl = (
    <FilterDropdown
      label={t("filters.service")}
      allLabel={t("filters.serviceAll")}
      options={[
        { value: "all", label: t("filters.serviceAll") },
        ...services.map((s) => ({ value: s.id, label: s.name })),
        ...(hasCustom
          ? [{ value: SERVICE_CUSTOM, label: t("filters.serviceCustom") }]
          : []),
      ]}
      value={[value.serviceId]}
      onChange={(next) => onChange({ ...value, serviceId: next[0] ?? "all" })}
      doneLabel={t("filters.done")}
    />
  );

  const sortControl = (
    <FilterDropdown
      label={t("filters.sort")}
      allLabel={t("filters.sortNewest")}
      options={[
        { value: "newest", label: t("filters.sortNewest") },
        { value: "priceAsc", label: t("filters.sortPriceAsc") },
        { value: "priceDesc", label: t("filters.sortPriceDesc") },
        { value: "soonest", label: t("filters.sortSoonest") },
      ]}
      value={[value.sort]}
      onChange={(next) =>
        onChange({ ...value, sort: (next[0] ?? "newest") as JobSort })
      }
      doneLabel={t("filters.done")}
    />
  );

  const statusControl = statusOptions ? (
    <FilterDropdown
      label={t("filters.status")}
      allLabel={t("filters.statusAll")}
      options={[
        { value: "all", label: t("filters.statusAll") },
        ...statusOptions.map((s) => ({ value: s, label: tStatus(s) })),
      ]}
      value={[value.status]}
      onChange={(next) =>
        onChange({ ...value, status: (next[0] ?? "all") as "all" | JobStatus })
      }
      doneLabel={t("filters.done")}
    />
  ) : null;

  // `setOpen(!open)` rather than the updater form: `onOpenChange` is a plain
  // (next: boolean) => void, so a function argument would be stored as state.
  const toggleButton = showTrigger ? (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-sm"
    >
      <Icon name="filter" size="sm" />
      {t("filters.button")}
      {activeCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
          {activeCount}
        </span>
      )}
      <Icon
        name="chevron"
        size="sm"
        className={`text-muted-foreground transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
      />
    </button>
  ) : null;

  const clearButton = showClear ? (
    <button
      type="button"
      className="btn-ghost btn-sm"
      onClick={() => onChange(DEFAULT_JOB_FILTERS)}
    >
      {t("filters.clear")}
    </button>
  ) : null;

  if (variant === "kg") {
    return (
      <div className="flex flex-col gap-2">
        {toggleButton && <div>{toggleButton}</div>}
        {open && (
          <div className="flex flex-col gap-2">
            {typeControl}
            {serviceControl}
            {sortControl}
            {clearButton}
          </div>
        )}
      </div>
    );
  }

  // Closed: just the trigger — or nothing at all when the caller owns it.
  if (!open) {
    return toggleButton ? <div>{toggleButton}</div> : null;
  }

  if (layout === "stack") {
    return (
      <div className="flex flex-col gap-2">
        {toggleButton && <div>{toggleButton}</div>}
        <div>
          <label className="lbl mb-1 block">{t("filters.type")}</label>
          {typeControl}
        </div>
        <div>
          <label className="lbl mb-1 block">{t("filters.service")}</label>
          {serviceControl}
        </div>
        <div>
          <label className="lbl mb-1 block">{t("filters.sort")}</label>
          {sortControl}
        </div>
        {statusControl && (
          <div>
            <label className="lbl mb-1 block">{t("filters.status")}</label>
            {statusControl}
          </div>
        )}
        {clearButton}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div>{toggleButton}</div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-36 flex-1">
          <label className="lbl mb-1 block">{t("filters.type")}</label>
          {typeControl}
        </div>
        <div className="min-w-44 flex-1">
          <label className="lbl mb-1 block">{t("filters.service")}</label>
          {serviceControl}
        </div>
        <div className="min-w-44 flex-1">
          <label className="lbl mb-1 block">{t("filters.sort")}</label>
          {sortControl}
        </div>
        {statusControl && (
          <div className="min-w-36 flex-1">
            <label className="lbl mb-1 block">{t("filters.status")}</label>
            {statusControl}
          </div>
        )}
        {clearButton}
      </div>
    </div>
  );
}
