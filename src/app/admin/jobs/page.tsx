"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { Card, DataTable, EmptyState, Pill, Tabs, formatPKR } from "@/components/ui";
import { JOB_STATUS_LABEL, type Job, type JobStatus } from "@/lib/types";

const CLOSED = new Set<JobStatus>(["paid", "rated", "cancelled"]);

type Filter = "all" | "unassigned" | "active" | "done";

function tone(status: JobStatus) {
  if (status === "cancelled" || status === "disputed") return "bad" as const;
  if (status === "paid" || status === "rated") return "ok" as const;
  if (status === "created" || status === "bidding") return "warn" as const;
  return "info" as const;
}

export default function AdminJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("jobs")
        .select("*")
        .order("created_at", { ascending: false });
      setJobs((data as Job[]) || []);
    })();
  }, []);

  const shown = useMemo(() => {
    if (filter === "unassigned") return jobs.filter((j) => !j.provider_id && !CLOSED.has(j.status));
    if (filter === "active") return jobs.filter((j) => j.provider_id && !CLOSED.has(j.status));
    if (filter === "done") return jobs.filter((j) => CLOSED.has(j.status));
    return jobs;
  }, [jobs, filter]);

  return (
    <AdminShell>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">Jobs</h2>
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { key: "all", label: `All (${jobs.length})` },
              { key: "unassigned", label: "Unassigned" },
              { key: "active", label: "Active" },
              { key: "done", label: "Done" },
            ]}
          />
        </div>

        <div className="mt-4">
          {shown.length === 0 ? (
            <EmptyState icon="inbox" title="No jobs in this view" />
          ) : (
            <DataTable
              head={["Job", "Customer area", "Created", "Assigned", "Amount", "Status"]}
            >
              {shown.map((job) => (
                <tr key={job.id}>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{job.title}</span>
                      {job.type === "custom" && <Pill tone="warn">Custom</Pill>}
                    </div>
                    {job.status === "cancelled" && job.cancel_reason && (
                      <div className="mt-0.5 text-xs text-destructive">
                        Reason: {job.cancel_reason}
                      </div>
                    )}
                  </td>
                  <td className="max-w-[16rem] truncate text-muted-foreground">{job.address}</td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {new Date(job.created_at).toLocaleDateString("en-PK")}
                    <div className="text-xs">
                      {new Date(job.created_at).toLocaleTimeString("en-PK", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>
                  <td>
                    {job.provider_id ? (
                      <Pill tone="info">Assigned</Pill>
                    ) : (
                      <Pill tone="gray">Unassigned</Pill>
                    )}
                  </td>
                  <td className="whitespace-nowrap font-semibold">{formatPKR(job.price)}</td>
                  <td>
                    <Pill tone={tone(job.status)}>{JOB_STATUS_LABEL[job.status]}</Pill>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </Card>
    </AdminShell>
  );
}
