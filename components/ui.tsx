"use client";
// Minimal shadcn-style UI kit — hand-rolled (no Radix runtime) to keep the bundle lean
// while matching the shadcn class conventions. Accessible: aria-labels on icon buttons,
// semantic elements, 44px minimum touch targets on controls.

import React, { useEffect, useRef, useState } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------- Button ----------
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md";
};
export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-[44px] sm:min-h-0";
  const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm" };
  const variants = {
    primary: "bg-teal-700 text-white hover:bg-teal-800",
    outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  };
  return <button className={cn(base, sizes[size], variants[variant], className)} {...props} />;
}

// ---------- Card ----------
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-lg border border-slate-200 bg-white", className)}>{children}</div>;
}
export function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-4", className)}>{children}</div>;
}

// ---------- Badge ----------
export function Badge({
  tone = "slate",
  className,
  children,
}: {
  tone?: "green" | "amber" | "red" | "slate" | "teal" | "outline";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    outline: "bg-white text-slate-500 border-slate-300",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

// ---------- Inputs ----------
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600",
        className
      )}
      {...props}
    />
  );
});

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Checkbox({ label, checked, onChange, disabled }: { label: React.ReactNode; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex min-h-[44px] items-center gap-2 text-sm", disabled ? "opacity-50" : "cursor-pointer")}>
      <input type="checkbox" className="h-4 w-4 accent-teal-700" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span className="text-slate-700">{label}</span>
    </label>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 5 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <input type="range" aria-label="Minimum completeness" className="w-full accent-teal-700" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />;
}

// ---------- Tabs ----------
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: React.ReactNode }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "min-h-[44px] px-3 text-sm font-medium transition-colors sm:min-h-0 sm:py-2",
            active === t.id ? "border-b-2 border-teal-700 text-teal-700" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------- JsonViewer (collapsible raw AI output) ----------
export function JsonViewer({ label, raw, defaultOpen = false }: { label?: string; raw: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-slate-200">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 sm:min-h-0"
      >
        <span>{label ?? "View raw AI output"}</span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <pre className="slim-scroll max-h-96 overflow-auto border-t border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
          {JSON.stringify(raw, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

// ---------- Skeleton / Empty ----------
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}

export function EmptyState({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-slate-500">{message}</p>
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

// ---------- Drawer (record detail) ----------
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="slim-scroll relative h-full w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close detail panel">
            ✕
          </Button>
        </div>
        {children}
      </aside>
    </div>
  );
}

// ---------- Progress bar ----------
export function ProgressBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-slate-500">{pct}%</span>
    </div>
  );
}

// ---------- helpers ----------
export function useAutoScroll<T>(dep: T) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [dep]);
  return ref;
}

export function fmtIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  const mins = Math.round(Math.abs(diff) / 60000);
  const fmt = (v: number, u: string) => `${v} ${u}${v === 1 ? "" : "s"}`;
  const span = mins < 60 ? fmt(mins, "min") : mins < 1440 ? fmt(Math.round(mins / 60), "hr") : fmt(Math.round(mins / 1440), "day");
  return diff >= 0 ? `in ${span}` : `${span} ago`;
}
