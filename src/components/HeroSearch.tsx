"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

// The hero's inline search (prototype `.hero .search`). Hands the query to /book,
// which seeds its own filter from `?q=`.
export function HeroSearch({ placeholder }: { placeholder?: string }) {
  const [q, setQ] = useState("");
  const router = useRouter();

  return (
    <form
      className="hero-search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/book/?q=${encodeURIComponent(q.trim())}` : "/book");
      }}
    >
      <Icon name="search" className="text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder ?? "Search e.g. leaking tap, AC gas…"}
        autoComplete="off"
        aria-label="Search services"
      />
      <button type="submit" className="btn-primary btn-sm shrink-0">
        Search
      </button>
    </form>
  );
}
