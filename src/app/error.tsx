"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-5 text-center">
      <div className="text-4xl">⚠️</div>
      <h1 className="mt-3 text-xl font-bold">Something went wrong</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred. Please try again — if it keeps happening, contact support.
      </p>
      <div className="mt-5 flex gap-3">
        <button onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-ghost">
          Go home
        </Link>
      </div>
    </div>
  );
}
