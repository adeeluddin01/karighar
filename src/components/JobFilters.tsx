"use client";

import { useLanguage } from "@/lib/i18n";
import {
  DEFAULT_JOB_FILTERS,
  SERVICE_CUSTOM,
  isDefaultFilters,
  type JobFilters,
  type JobSort,
  type JobTypeFilter,
  type ServiceOption,
} from "@/lib/jobFilters";
import type { JobStatus } from "@/lib/types";
import { Select } from "@/components/ui";

// One filter bar for every jobs list. The controls are the same everywhere —
// type, service, sort, and (where it applies) status — so a pro sees the
// same filters on the dashboard list and the map, and a customer sees them
// on bookings.
//
// `variant="kg"` renders the redesign's `.in` selects for the phone
// bookings screen; the default renders the legacy <Select> used inside
// <AppShell>. Same state, same options, same labels either way.

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
    <Select
      value={value.type}
      onChange={(e) => onChange({ ...value, type: e.target.value as JobTypeFilter })}
      aria-label={t("filters.type")}
    >
      <option value="all">{t("filters.typeAll")}</option>
      <option value="fixed">{t("filters.typeFixed")}</option>
      <option value="custom">{t("filters.typeCustom")}</option>
    </Select>
  );

  const serviceControl = (
    <Select
      value={value.serviceId}
      onChange={(e) => onChange({ ...value, serviceId: e.target.value })}
      aria-label={t("filters.service")}
    >
      <option value="all">{t("filters.serviceAll")}</option>
      {services.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      {hasCustom && <option value={SERVICE_CUSTOM}>{t("filters.serviceCustom")}</option>}
    </Select>
  );

  const sortControl = (
    <Select
      value={value.sort}
      onChange={(e) => onChange({ ...value, sort: e.target.value as JobSort })}
      aria-label={t("filters.sort")}
    >
      <option value="newest">{t("filters.sortNewest")}</option>
      <option value="priceAsc">{t("filters.sortPriceAsc")}</option>
      <option value="priceDesc">{t("filters.sortPriceDesc")}</option>
      <option value="soonest">{t("filters.sortSoonest")}</option>
    </Select>
  );

  const statusControl = statusOptions ? (
    <Select
      value={value.status}
      onChange={(e) =>
        onChange({ ...value, status: e.target.value as "all" | JobStatus })
      }
      aria-label={t("filters.status")}
    >
      <option value="all">{t("filters.statusAll")}</option>
      {statusOptions.map((s) => (
        <option key={s} value={s}>
          {tStatus(s)}
        </option>
      ))}
    </Select>
  ) : null;

  if (variant === "kg") {
    return (
      <div className="flex flex-wrap gap-2">
        <label className="in flat" style={{ flex: "1 1 140px" }}>
          <select
            value={value.type}
            onChange={(e) => onChange({ ...value, type: e.target.value as JobTypeFilter })}
            aria-label={t("filters.type")}
          >
            <option value="all">{t("filters.typeAll")}</option>
            <option value="fixed">{t("filters.typeFixed")}</option>
            <option value="custom">{t("filters.typeCustom")}</option>
          </select>
        </label>
        <label className="in flat" style={{ flex: "1 1 140px" }}>
          <select
            value={value.serviceId}
            onChange={(e) => onChange({ ...value, serviceId: e.target.value })}
            aria-label={t("filters.service")}
          >
            <option value="all">{t("filters.serviceAll")}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {hasCustom && <option value={SERVICE_CUSTOM}>{t("filters.serviceCustom")}</option>}
          </select>
        </label>
        <label className="in flat" style={{ flex: "1 1 140px" }}>
          <select
            value={value.sort}
            onChange={(e) => onChange({ ...value, sort: e.target.value as JobSort })}
            aria-label={t("filters.sort")}
          >
            <option value="newest">{t("filters.sortNewest")}</option>
            <option value="priceAsc">{t("filters.sortPriceAsc")}</option>
            <option value="priceDesc">{t("filters.sortPriceDesc")}</option>
            <option value="soonest">{t("filters.sortSoonest")}</option>
          </select>
        </label>
        {showClear && (
          <button type="button" className="btn sm ghost" onClick={() => onChange(DEFAULT_JOB_FILTERS)}>
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
        <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(DEFAULT_JOB_FILTERS)}>
          {t("filters.clear")}
        </button>
      )}
    </div>
  );
}
