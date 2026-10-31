// Shared presentation primitives: page header, KPI cards, status badges,
// empty states, form fields, and money display. Pure white, neutral borders.

import type { ReactNode } from "react";
import { money } from "@/lib/format";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  testid,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warning" | "positive";
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value}
      </p>
      {sub ? (
        <p
          className={`mt-1 text-xs ${
            tone === "warning" ? "text-amber-600" : tone === "positive" ? "text-emerald-600" : "text-slate-500"
          }`}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

const TONE_CLASSES: Record<string, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-600",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
};

export function StatusBadge({
  label,
  tone = "slate",
  testid,
}: {
  label: string;
  tone?: string;
  testid?: string;
}) {
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        TONE_CLASSES[tone] ?? TONE_CLASSES.slate
      }`}
    >
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  message,
  action,
  testid,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  testid?: string;
}) {
  return (
    <div
      data-testid={testid}
      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-200 bg-white px-6 py-12 text-center"
    >
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {message ? <p className="max-w-sm text-xs text-slate-500">{message}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Money({
  cents,
  className = "",
}: {
  cents: number;
  className?: string;
}) {
  return <span className={`font-mono tabular-nums ${className}`}>{money(cents)}</span>;
}

export function Field({
  label,
  children,
  error,
  hint,
}: {
  label: string;
  children: ReactNode;
  error?: string | null;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
      {!error && hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
      Demo data
    </span>
  );
}
