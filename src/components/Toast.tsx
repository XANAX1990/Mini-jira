"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Kind = "success" | "error";
type ToastItem = { id: number; kind: Kind; message: string };

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {});

/** Show a short message for the result of an action: `toast("Saved")` / `toast(res.error, "error")`. */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: Kind = "success") => {
      const id = nextId.current++;
      setToasts((all) => [...all, { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
    },
    [dismiss]
  );

  return (
    <ToastContext value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-sm items-start gap-3 rounded-md px-4 py-3 text-sm text-white shadow-lg ${
              t.kind === "error" ? "bg-red-600" : "bg-green-700"
            }`}
          >
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="font-bold"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
