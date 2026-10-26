"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { Icon, type IconName } from "@/components/Icon";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Pill,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { CATEGORY_ICON_CHOICES, CATEGORY_ICON_WEB } from "@/lib/catalogIcons";
import type { Service, ServiceCategory } from "@/lib/types";

// services.unit is free text in the schema; these are the values the seed
// catalog actually uses, and what the customer screens render after "per".
const UNITS = ["job", "visit", "unit", "item", "sq ft"];

type CatForm = { name: string; icon: string; sort_order: string; is_active: boolean };
type SvcForm = {
  name: string;
  description: string;
  base_price: string;
  unit: string;
  visit_fee: string;
  is_active: boolean;
};

const BLANK_CAT: CatForm = { name: "", icon: "wrench", sort_order: "", is_active: true };
const BLANK_SVC: SvcForm = {
  name: "",
  description: "",
  base_price: "",
  unit: "job",
  visit_fee: "0",
  is_active: true,
};

/** Blank price means "on quote" — the schema stores null, not zero. */
const toPrice = (raw: string) => (raw.trim() === "" ? null : Number(raw));

export default function AdminCatalog() {
  const toast = useToast();
  const [cats, setCats] = useState<ServiceCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [jobCounts, setJobCounts] = useState<Map<string, number>>(new Map());
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Which editor is open. `catFor`/`svcFor` hold the row being edited, or
  // the parent category id when creating.
  const [catModal, setCatModal] = useState<{ cat: ServiceCategory | null } | null>(null);
  const [catForm, setCatForm] = useState<CatForm>(BLANK_CAT);
  const [svcModal, setSvcModal] = useState<{ categoryId: string; svc: Service | null } | null>(
    null
  );
  const [svcForm, setSvcForm] = useState<SvcForm>(BLANK_SVC);
  const [confirm, setConfirm] = useState<
    { kind: "cat"; cat: ServiceCategory } | { kind: "svc"; svc: Service } | null
  >(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: c }, { data: s }, { data: j }] = await Promise.all([
      supabase.from("service_categories").select("*").order("sort_order"),
      supabase.from("services").select("*").order("name"),
      // Which services are in use, so a delete that the FK would refuse is
      // explained up front rather than surfacing as a raw constraint error.
      supabase.from("jobs").select("service_id"),
    ]);
    setCats((c as ServiceCategory[]) || []);
    setServices((s as Service[]) || []);
    const counts = new Map<string, number>();
    for (const row of (j as { service_id: string | null }[]) || []) {
      if (row.service_id) counts.set(row.service_id, (counts.get(row.service_id) ?? 0) + 1);
    }
    setJobCounts(counts);
    setFetching(false);
  }, []);

  useEffect(() => {
    // Wrapped so nothing in load() runs synchronously in the effect body.
    void (async () => {
      await load();
    })();
  }, [load]);

  /* ----------------------------- categories ----------------------------- */

  function openCat(cat: ServiceCategory | null) {
    setCatForm(
      cat
        ? {
            name: cat.name,
            icon: cat.icon ?? "wrench",
            sort_order: String(cat.sort_order),
            is_active: cat.is_active,
          }
        : // Default the new category to the end of the list.
          { ...BLANK_CAT, sort_order: String((cats.at(-1)?.sort_order ?? 0) + 1) }
    );
    setCatModal({ cat });
  }

  async function saveCat() {
    if (!catModal) return;
    const name = catForm.name.trim();
    if (!name) return;
    const payload = {
      name,
      icon: catForm.icon,
      sort_order: Number(catForm.sort_order) || 0,
      is_active: catForm.is_active,
    };
    setBusy("cat");
    const supabase = createClient();
    const { error } = catModal.cat
      ? await supabase.from("service_categories").update(payload).eq("id", catModal.cat.id)
      : await supabase.from("service_categories").insert(payload);
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setCatModal(null);
    toast(catModal.cat ? "Service updated." : "Service added.", "success");
    await load();
  }

  /* ------------------------------ services ------------------------------ */

  function openSvc(categoryId: string, svc: Service | null) {
    setSvcForm(
      svc
        ? {
            name: svc.name,
            description: svc.description ?? "",
            base_price: svc.base_price === null ? "" : String(svc.base_price),
            unit: svc.unit,
            visit_fee: String(svc.visit_fee),
            is_active: svc.is_active,
          }
        : BLANK_SVC
    );
    setSvcModal({ categoryId, svc });
  }

  async function saveSvc() {
    if (!svcModal) return;
    const name = svcForm.name.trim();
    if (!name) return;
    const payload = {
      category_id: svcModal.categoryId,
      name,
      description: svcForm.description.trim() || null,
      base_price: toPrice(svcForm.base_price),
      unit: svcForm.unit,
      visit_fee: Number(svcForm.visit_fee) || 0,
      is_active: svcForm.is_active,
    };
    setBusy("svc");
    const supabase = createClient();
    const { error } = svcModal.svc
      ? await supabase.from("services").update(payload).eq("id", svcModal.svc.id)
      : await supabase.from("services").insert(payload);
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setSvcModal(null);
    toast(svcModal.svc ? "Sub-service updated." : "Sub-service added.", "success");
    await load();
  }

  async function toggleActive(svc: Service) {
    setBusy(svc.id);
    const { error } = await createClient()
      .from("services")
      .update({ is_active: !svc.is_active })
      .eq("id", svc.id);
    setBusy(null);
    if (error) {
      toast(error.message, "error");
      return;
    }
    await load();
  }

  /* ------------------------------ deleting ------------------------------ */

  async function doDelete() {
    if (!confirm) return;
    const supabase = createClient();
    setBusy("delete");
    const { error } =
      confirm.kind === "cat"
        ? await supabase.from("service_categories").delete().eq("id", confirm.cat.id)
        : await supabase.from("services").delete().eq("id", confirm.svc.id);
    setBusy(null);
    if (error) {
      // jobs.service_id is NO ACTION, so Postgres refuses this once a job
      // exists. Say what that means instead of showing the constraint.
      toast(
        "Couldn't delete — it's still attached to past bookings. Hide it instead; " +
          "hidden items disappear from booking but keep their history.",
        "error"
      );
      return;
    }
    setConfirm(null);
    toast("Deleted.", "success");
    await load();
  }

  if (fetching) {
    return (
      <AdminShell>
        <Spinner label="Loading catalog…" />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Services</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A service is a category customers browse; a sub-service is the bookable item inside
            it. Leave a sub-service&apos;s price blank to make it &ldquo;on quote&rdquo;.
          </p>
        </div>
        <Button icon="plus" onClick={() => openCat(null)}>
          Add service
        </Button>
      </div>

      {cats.length === 0 ? (
        <EmptyState
          icon="file"
          title="No services yet"
          hint="Add your first service, or run supabase/schema.sql to seed the Karachi catalog."
        >
          <Button size="sm" onClick={() => openCat(null)}>
            Add service
          </Button>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {cats.map((cat) => {
            const kids = services.filter((s) => s.category_id === cat.id);
            return (
              <section key={cat.id}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="emoji">
                      <Icon
                        name={(CATEGORY_ICON_WEB[cat.icon ?? ""] ?? "wrench") as IconName}
                        className="text-accent-foreground"
                      />
                    </span>
                    <div>
                      <h2 className="flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight">
                        {cat.name}
                        {!cat.is_active && <Pill tone="bad">Hidden</Pill>}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        #{cat.sort_order} · {kids.length}{" "}
                        {kids.length === 1 ? "sub-service" : "sub-services"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openCat(cat)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "cat", cat })}>
                      Delete
                    </Button>
                    <Button size="sm" icon="plus" onClick={() => openSvc(cat.id, null)}>
                      Add sub-service
                    </Button>
                  </div>
                </div>

                {kids.length === 0 ? (
                  <Card className="text-sm text-muted-foreground">
                    Nothing bookable here yet — customers can&apos;t book this service until it
                    has at least one sub-service.
                  </Card>
                ) : (
                  <div className="flex flex-col gap-3">
                    {kids.map((svc) => (
                      <Card key={svc.id}>
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-bold">{svc.name}</span>
                              {!svc.is_active && <Pill tone="bad">Hidden</Pill>}
                              {svc.base_price === null && <Pill tone="warn">On quote</Pill>}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {svc.description || "No description"} · per {svc.unit}
                              {svc.visit_fee > 0 && ` · Rs ${svc.visit_fee} visit fee`}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="whitespace-nowrap font-bold">
                              {svc.base_price === null ? "—" : `Rs ${svc.base_price}`}
                            </span>
                            <Button size="sm" variant="ghost" onClick={() => openSvc(cat.id, svc)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy === svc.id}
                              onClick={() => toggleActive(svc)}
                            >
                              {svc.is_active ? "Hide" : "Show"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirm({ kind: "svc", svc })}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* ------------------------- category editor ------------------------- */}
      {catModal && (
        <Modal
          title={catModal.cat ? "Edit service" : "Add a service"}
          subtitle="A category customers browse, like “Electrician”."
          onClose={() => setCatModal(null)}
        >
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <Input
                value={catForm.name}
                onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                placeholder="Electrician"
                aria-label="Service name"
              />
            </Field>
            <Field
              label="Icon"
              hint="Only icons that render on both the web and phone layouts are listed."
            >
              <Select
                value={catForm.icon}
                onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })}
              >
                {CATEGORY_ICON_CHOICES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sort order" hint="Lowest first on the booking screen.">
              <Input
                type="number"
                inputMode="numeric"
                value={catForm.sort_order}
                onChange={(e) => setCatForm({ ...catForm, sort_order: e.target.value })}
                aria-label="Sort order"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={catForm.is_active}
                onChange={(e) => setCatForm({ ...catForm, is_active: e.target.checked })}
              />
              Visible to customers
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCatModal(null)}>
                Cancel
              </Button>
              <Button disabled={busy === "cat" || !catForm.name.trim()} onClick={saveCat}>
                {catModal.cat ? "Save" : "Add service"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ------------------------ sub-service editor ----------------------- */}
      {svcModal && (
        <Modal
          title={svcModal.svc ? "Edit sub-service" : "Add a sub-service"}
          subtitle={cats.find((c) => c.id === svcModal.categoryId)?.name}
          onClose={() => setSvcModal(null)}
        >
          <div className="flex flex-col gap-4">
            <Field label="Name">
              <Input
                value={svcForm.name}
                onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })}
                placeholder="Fan installation"
                aria-label="Sub-service name"
              />
            </Field>
            <Field label="Description">
              <Textarea
                rows={2}
                value={svcForm.description}
                onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })}
                placeholder="What's included"
                aria-label="Description"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Base price" hint="Blank = on quote">
                <Input
                  type="number"
                  inputMode="numeric"
                  prefix="Rs"
                  value={svcForm.base_price}
                  onChange={(e) => setSvcForm({ ...svcForm, base_price: e.target.value })}
                  placeholder="quote"
                  aria-label="Base price"
                />
              </Field>
              <Field label="Visit fee">
                <Input
                  type="number"
                  inputMode="numeric"
                  prefix="Rs"
                  value={svcForm.visit_fee}
                  onChange={(e) => setSvcForm({ ...svcForm, visit_fee: e.target.value })}
                  aria-label="Visit fee"
                />
              </Field>
            </div>
            <Field label="Priced per">
              <Select
                value={svcForm.unit}
                onChange={(e) => setSvcForm({ ...svcForm, unit: e.target.value })}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={svcForm.is_active}
                onChange={(e) => setSvcForm({ ...svcForm, is_active: e.target.checked })}
              />
              Bookable by customers
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSvcModal(null)}>
                Cancel
              </Button>
              <Button disabled={busy === "svc" || !svcForm.name.trim()} onClick={saveSvc}>
                {svcModal.svc ? "Save" : "Add sub-service"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* --------------------------- delete guard -------------------------- */}
      {confirm && (
        <Modal title="Delete for good?" onClose={() => setConfirm(null)}>
          <DeleteBody confirm={confirm} services={services} jobCounts={jobCounts} />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy === "delete"} onClick={doDelete}>
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </AdminShell>
  );
}

/**
 * What deleting actually does, spelled out before it happens.
 *
 * Two things make this worth a dialog rather than a confirm(): deleting a
 * category CASCADES to every sub-service under it, and anything already
 * booked cannot be deleted at all because jobs.service_id is NO ACTION.
 * Better to say so than to let the admin discover it from an error.
 */
function DeleteBody({
  confirm,
  services,
  jobCounts,
}: {
  confirm: { kind: "cat"; cat: ServiceCategory } | { kind: "svc"; svc: Service };
  services: Service[];
  jobCounts: Map<string, number>;
}) {
  const affected =
    confirm.kind === "cat" ? services.filter((s) => s.category_id === confirm.cat.id) : [confirm.svc];
  const booked = affected.filter((s) => (jobCounts.get(s.id) ?? 0) > 0);
  const name = confirm.kind === "cat" ? confirm.cat.name : confirm.svc.name;

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        Delete <strong>{name}</strong>
        {confirm.kind === "cat" && affected.length > 0 && (
          <>
            {" "}
            and the {affected.length} {affected.length === 1 ? "sub-service" : "sub-services"}{" "}
            inside it
          </>
        )}
        ?
      </p>

      {booked.length > 0 ? (
        <Card className="bg-warning-light">
          <p className="text-sm font-semibold text-warning-foreground">
            This can&apos;t be deleted
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {booked.length === 1
              ? `"${booked[0].name}" has`
              : `${booked.length} of these have`}{" "}
            past bookings attached, and deleting would erase that history — so the database will
            refuse it. Hide it instead: hidden items vanish from the booking screens while every
            past job keeps working.
          </p>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nothing has been booked under{" "}
          {confirm.kind === "cat" ? "this service" : "this sub-service"}, so nothing is lost. This
          cannot be undone.
        </p>
      )}
    </div>
  );
}
