"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cx, initials } from "@/lib/format";

// ── Button ──
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "icon"; loading?: boolean }
>(function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref) {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
    secondary: "bg-white text-zinc-800 border border-zinc-200 hover:bg-zinc-50 shadow-xs",
    ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
    danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
    success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
  };
  const sizes = { sm: "h-8 px-2.5 text-[13px] gap-1.5", md: "h-9 px-3.5 text-sm gap-2", icon: "h-9 w-9 justify-center" };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
});

// ── Inputs ──
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        "h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm placeholder:text-zinc-400 outline-none transition focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15",
        className
      )}
      {...rest}
    />
  );
});

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        "h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15",
        className
      )}
      {...rest}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-brand-600" : "bg-zinc-300")}
    >
      <span className={cx("absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-4.5" : "translate-x-0.5")} />
    </button>
  );
}

// ── Display ──
const tones = {
  neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
};
export type Tone = keyof typeof tones;
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

const avatarPalette = ["bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-700", "bg-indigo-100 text-indigo-700"];
export function Avatar({
  name,
  src,
  size = 32,
  online,
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
  online?: boolean | null;
  className?: string;
}) {
  const color = avatarPalette[(name || "?").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % avatarPalette.length];
  return (
    <span className={cx("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className={cx("flex h-full w-full items-center justify-center rounded-full font-semibold", color)} style={{ fontSize: Math.max(10, size * 0.38) }}>
          {initials(name)}
        </span>
      )}
      {online !== undefined && online !== null && (
        <span
          className={cx("absolute right-0 bottom-0 rounded-full ring-2 ring-white", online ? "bg-emerald-500" : "bg-zinc-300")}
          style={{ width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28) }}
          aria-label={online ? "Online" : "Offline"}
        />
      )}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

export function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center animate-fade-in">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">{icon}</div>
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-sm text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("rounded-xl border border-zinc-200 bg-white shadow-xs", className)}>{children}</div>;
}

// ── Overlays ──
export function Modal({ open, onClose, title, children, footer, width = 480 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/40 p-0 sm:items-center sm:p-4 animate-fade-in" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl animate-slide-up"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-y-auto px-5 py-4 scroll-thin">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Lightweight dropdown menu (click outside / Escape to close). */
export function Menu({ trigger, children, align = "left", width = 220 }: { trigger: (p: { open: boolean; toggle: () => void }) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "left" | "right"; width?: number }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          className={cx("absolute z-40 mt-1.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg animate-fade-in", align === "right" ? "right-0" : "left-0")}
          style={{ width }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ onClick, children, active, danger }: { onClick: () => void; children: React.ReactNode; active?: boolean; danger?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
        danger ? "text-red-600 hover:bg-red-50" : "text-zinc-700 hover:bg-zinc-100",
        active && "bg-zinc-100 font-medium text-zinc-900"
      )}
    >
      {children}
    </button>
  );
}

// ── Toasts ──
type ToastItem = { id: number; title: string; description?: string; tone?: "default" | "error" | "success" };
const ToastContext = React.createContext<(t: Omit<ToastItem, "id">) => void>(() => undefined);
export const useToast = () => React.useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const push = React.useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-xl border bg-white px-4 py-3 shadow-lg animate-slide-up",
              t.tone === "error" ? "border-red-200" : t.tone === "success" ? "border-emerald-200" : "border-zinc-200"
            )}
          >
            <p className={cx("text-sm font-medium", t.tone === "error" && "text-red-700")}>{t.title}</p>
            {t.description && <p className="mt-0.5 text-[13px] text-zinc-500">{t.description}</p>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
