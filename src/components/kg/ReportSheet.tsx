"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { KIcon } from "@/components/kg/icons";
import { clsx } from "@/lib/clsx";

const REASONS = [
  "Not fixed properly",
  "Pro didn't arrive",
  "Overcharged",
  "Damaged something",
  "Rude behaviour",
  "Something else",
];

/**
 * "Report an issue" — raises a dispute on a job, in the redesign's sheet
 * idiom. Writes the same `disputes` row as the legacy `<DisputeButton>`.
 */
export function ReportSheet({
  jobId,
  userId,
  onClose,
  onDone,
}: {
  jobId: string;
  userId: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    const text = detail.trim() ? `${reason} — ${detail.trim()}` : reason;
    const { error } = await createClient()
      .from("disputes")
      .insert({ job_id: jobId, raised_by: userId, reason: text });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    toast("Reported. Our team will follow up.", "success");
    onDone?.();
    onClose();
  }

  return (
    <div
      className="over"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="over-card" role="dialog" aria-modal="true" aria-label="Report an issue">
        <span className="grab" />
        <div className="sh-head">
          <div>
            <h2 style={{ fontSize: 19 }}>Report an issue</h2>
            <small>We read every report. Tell us what went wrong.</small>
          </div>
          <button type="button" className="ic sm" onClick={onClose} aria-label="Close">
            <KIcon name="x" />
          </button>
        </div>

        <div className="chips wrap" role="radiogroup" aria-label="What went wrong">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              className={clsx("chip", reason === r && "sel")}
              onClick={() => setReason(r)}
            >
              {r}
            </button>
          ))}
        </div>

        <textarea
          className="ta"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Anything else we should know?"
          aria-label="More detail"
        />

        <div className="note warn">
          <KIcon name="shield" />
          <p>
            <b>Reported within 48 hours of the job?</b> We&rsquo;ll arrange a re-visit or a refund
            where it&rsquo;s warranted.
          </p>
        </div>

        <button
          type="button"
          className="btn wide"
          disabled={!reason || busy}
          onClick={submit}
        >
          {busy ? "Sending…" : "Submit report"}
        </button>
      </div>
    </div>
  );
}
