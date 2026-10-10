"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { KIcon } from "@/components/kg/icons";
import { clsx } from "@/lib/clsx";

type Message = { id: string; job_id: string; sender_id: string; text: string; created_at: string };

/**
 * Realtime job chat, as a sheet that rises over the screen — the chat button
 * on the tracking sheet opens it. Same data path as the pro-side `<JobChat>`.
 */
export function ChatSheet({
  jobId,
  userId,
  withName,
  onClose,
}: {
  jobId: string;
  userId: string;
  withName?: string | null;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at");
      setMessages((data as Message[]) ?? []);
    })();

    const channel = supabase
      .channel(`kg-messages:${jobId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `job_id=eq.${jobId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message])
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    await createClient().from("messages").insert({ job_id: jobId, sender_id: userId, text: body });
  }

  return (
    <div
      className="over"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="over-card" role="dialog" aria-modal="true" aria-label="Messages">
        <span className="grab" />
        <div className="sh-head">
          <div>
            <h2 style={{ fontSize: 19 }}>Messages</h2>
            <small>{withName ? `With ${withName}` : "With your pro"}</small>
          </div>
          <button type="button" className="ic sm" onClick={onClose} aria-label="Close messages">
            <KIcon name="x" />
          </button>
        </div>

        <div className="msgs">
          {messages.length === 0 && (
            <small style={{ textAlign: "center", padding: "28px 0" }}>
              No messages yet. Say salaam 👋
            </small>
          )}
          {messages.map((m) => (
            <div key={m.id} className={clsx("bub", m.sender_id === userId ? "me" : "them")}>
              {m.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label className="in flat">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message…"
              autoComplete="off"
              aria-label="Message"
            />
          </label>
          <button type="submit" className="ic ok" aria-label="Send" disabled={!text.trim()}>
            <KIcon name="send" />
          </button>
        </form>
      </div>
    </div>
  );
}
