"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Button, Textarea } from "@/components/ui";
import { Icon } from "@/components/Icon";

// "Report a problem" — lets a customer or provider raise a dispute on a job.
export function DisputeButton({ jobId, userId }: { jobId: string; userId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    const { error } = await createClient().from("disputes").insert({
      job_id: jobId,
      raised_by: userId,
      reason: reason.trim(),
    });
    setBusy(false);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setDone(true);
    setOpen(false);
    setReason("");
    toast("Reported. Our team will look into it.", "success");
  }

  if (done) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Problem reported — support will follow up.
      </p>
    );
  }

  return (
    <div className="text-center">
      {open ? (
        <div className="space-y-3 text-left">
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the problem…"
            aria-label="Describe the problem"
          />
          <div className="flex gap-2">
            <Button variant="danger" size="sm" disabled={busy} onClick={submit}>
              {busy ? "Sending…" : "Submit report"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
        >
          <Icon name="alert" size="sm" /> Report a problem
        </button>
      )}
    </div>
  );
}
