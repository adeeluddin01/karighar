"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { clsx } from "@/lib/clsx";

type Message = { id: string; job_id: string; sender_id: string; text: string; created_at: string };

// Realtime chat between customer and provider, scoped to a job.
export function JobChat({ jobId, userId }: { jobId: string; userId: string }) {
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
      setMessages((data as Message[]) || []);
    })();

    const channel = supabase
      .channel(`messages:${jobId}`)
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    await createClient().from("messages").insert({ job_id: jobId, sender_id: userId, text: body });
  }

  return (
    <div className="flex h-80 flex-col">
      <div className="chat flex-1">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            No messages yet. Say hello 👋
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={clsx("msg", m.sender_id === userId ? "me" : "them")}>
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="mt-3 flex items-center gap-2">
        <Input
          className="flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          autoComplete="off"
          aria-label="Message"
        />
        <Button type="submit" round aria-label="Send">
          <Icon name="send" size="sm" />
        </Button>
      </form>
    </div>
  );
}
