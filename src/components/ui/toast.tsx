"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";
export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  /** ms; 0 = otomatik kapanma yok */
  duration?: number;
}

interface ToastContextValue {
  toast: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;
function nextId() {
  counter += 1;
  return `t${counter}`;
}

const TONE: Record<ToastType, { icon: typeof Info; ring: string; iconColor: string; role: "status" | "alert" }> = {
  success: { icon: CheckCircle2, ring: "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40", iconColor: "text-emerald-600 dark:text-emerald-400", role: "status" },
  error: { icon: XCircle, ring: "border-destructive/40 bg-destructive/10", iconColor: "text-destructive", role: "alert" },
  warning: { icon: AlertTriangle, ring: "border-amber-500/40 bg-amber-50 dark:bg-amber-950/40", iconColor: "text-amber-600 dark:text-amber-400", role: "alert" },
  info: { icon: Info, ring: "border-sky-500/40 bg-sky-50 dark:bg-sky-950/40", iconColor: "text-sky-600 dark:text-sky-400", role: "status" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId();
      const duration = t.duration ?? (t.type === "error" ? 8000 : 4500);
      setToasts((prev) => [...prev, { ...t, id }]);
      if (duration > 0) {
        timers.current[id] = setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach(clearTimeout); };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
        {toasts.map((t) => {
          const tone = TONE[t.type];
          const Icon = tone.icon;
          return (
            <div
              key={t.id}
              role={tone.role}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${tone.ring}`}
            >
              <Icon className={`mt-0.5 size-5 shrink-0 ${tone.iconColor}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                aria-label="Bildirimi kapat"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Sağlayıcı yoksa sessizce yut (test/edge); uygulama çökmesin
    return { toast: () => "", dismiss: () => {} };
  }
  return ctx;
}
