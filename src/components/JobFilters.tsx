"use client";

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

// One filter bar for every jobs list. The controls are the same everywhere:
// type (multi-select), service, sort, and (where it applies) status — so a
// pro sees the same filters on the dashboard list and the map, and a
// customer sees them on bookings.
//
// Every control is the same FilterDropdown: a button that opens a panel —
// a bottom sheet on phones, an anchored popover on desktop — so the bar
// works with touch and never relies on the native select popup. The
// `variant="kg"` layout is the phone bookings screen; the default is the
// legacy <AppShell> layout. Same state, same options, same labels either way.
export function JobFilters({
  services,
  hasCustom,
  value,
  onChange,
  statusOptions,
  variant = "legacy",
}: {
  services: ServiceOption[];
  hasCustom: boolean;
  value: JobFilters;
  onChange: (next: JobFilters) => void;
  /** Statuses present in the list. Omit where a status filter makes no sense. */
  statusOptions?: JobStatus[];
  variant?: "legacy" | "kg";
}) {
  const { t, tStatus } = useLanguage();
  const showClear = !isDefaultFilters(value);

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

  if (variant === "kg") {
    return (
      <div className="flex flex-wrap gap-2">
        <div style={{ flex: "1 1 140px" }}>{typeControl}</div>
        <div style={{ flex: "1 1 140px" }}>{serviceControl}</div>
        <div style={{ flex: "1 1 140px" }}>{sortControl}</div>
        {showClear && (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => onChange(DEFAULT_JOB_FILTERS)}
          >
            {t("filters.clear")}
          </button>
        )}
      </div>
    );
  }

  return (
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
      {showClear && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => onChange(DEFAULT_JOB_FILTERS)}
        >
          {t("filters.clear")}
        </button>
      )}
    </div>
  );
}
