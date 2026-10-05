import { JOB_STATUS_FLOW, JOB_STATUS_LABEL, type JobStatus } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { clsx } from "@/lib/clsx";

// Vertical progress timeline for a job's lifecycle (the prototype's .timeline).
export function JobTimeline({ status }: { status: JobStatus }) {
  if (status === "cancelled" || status === "disputed") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-destructive-light p-4 text-sm font-semibold text-destructive">
        <Icon name="alert" size="sm" />
        This job is {JOB_STATUS_LABEL[status].toLowerCase()}.
      </div>
    );
  }
  if (status === "created" || status === "bidding") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-warning-light p-4 text-sm font-semibold text-warning-foreground">
        <Icon name="clock" size="sm" />
        {JOB_STATUS_LABEL[status]}…
      </div>
    );
  }

  const currentIdx = JOB_STATUS_FLOW.indexOf(status);
  return (
    <ol className="timeline">
      {JOB_STATUS_FLOW.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={s} className={clsx("tl", (done || active) && "done", active && "now")}>
            <span className="dot">{done ? <Icon name="check" size="sm" /> : i + 1}</span>
            <span className={clsx("text-sm", active ? "font-bold" : "font-medium text-muted-foreground")}>
              {JOB_STATUS_LABEL[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
