import { createContext, useCallback, useContext, useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";

type ToastKind = "success" | "error";

interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastCtx {
  push: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

const TOAST_TTL_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const push = useCallback((message: string, kind: ToastKind = "success") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, kind }]);
    const handle = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, TOAST_TTL_MS);
    timers.current.set(id, handle);
  }, []);

  useEffect(() => {
    const stored = timers.current;
    return () => {
      stored.forEach((h) => clearTimeout(h));
      stored.clear();
    };
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div
        style={{
          position: "fixed",
          right: "1.5rem",
          bottom: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          zIndex: 10000,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast"
            style={{
              background: t.kind === "success" ? "#a6e3a1" : "#f38ba8",
              color: "#1e1e2e",
              padding: "0.6rem 1rem",
              borderRadius: 6,
              fontSize: "0.9rem",
              fontWeight: 500,
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              minWidth: 200,
              maxWidth: 360,
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
