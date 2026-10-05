"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { clsx } from "@/lib/clsx";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; message: string; kind: ToastKind };

const ToastCtx = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {/* .toasts clears the mobile bottom nav; see globals.css */}
      <div className="toasts px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "toast pointer-events-auto flex max-w-sm items-center gap-2",
              t.kind === "success" && "before:content-['✓']",
              t.kind === "error" && "before:content-['!']"
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
