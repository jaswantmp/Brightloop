// Formatting helpers. Money is integer cents + basis points end-to-end (decimal-safe);
// these helpers format for display only.

export function money(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function pct(bps: number): string {
  return `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

export function dateFmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso}${iso.length === 10 ? "T00:00:00" : ""}`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function monthLabel(month: string): string {
  const d = new Date(`${month}-15T00:00:00`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Status label + tone maps for badges (restrained, no neon).
type Tone = "slate" | "blue" | "emerald" | "amber" | "red";

export const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "slate" },
  quotation: { label: "Quotation", tone: "blue" },
  confirmed: { label: "Confirmed", tone: "emerald" },
  active: { label: "Active", tone: "emerald" },
  closed: { label: "Closed", tone: "slate" },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "slate" },
  confirmed: { label: "Unpaid", tone: "blue" },
  paid: { label: "Paid", tone: "emerald" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const QUOTATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "slate" },
  sent: { label: "Sent", tone: "blue" },
  accepted: { label: "Accepted", tone: "emerald" },
  rejected: { label: "Rejected", tone: "red" },
  expired: { label: "Expired", tone: "amber" },
};

export const REMINDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: "Scheduled", tone: "amber" },
  sent: { label: "Sent", tone: "emerald" },
  skipped: { label: "Skipped", tone: "slate" },
};

export const CHART_COLORS = {
  primary: "#0F172A",
  blue: "#3B82F6",
  emerald: "#10B981",
  amber: "#F59E0B",
  red: "#EF4444",
  violet: "#8B5CF6",
  grid: "#F1F5F9",
};

export const STATUS_COLORS: Record<string, string> = {
  paid: CHART_COLORS.emerald,
  unpaid: CHART_COLORS.blue,
  overdue: CHART_COLORS.red,
  draft: "#94A3B8",
  cancelled: "#CBD5E1",
};

export const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  overdue: "Overdue",
  draft: "Draft",
  cancelled: "Cancelled",
};

export const PERIOD_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

export const METHOD_LABELS: Record<string, string> = {
  card: "Card",
  bank_transfer: "Bank transfer",
  ach: "ACH",
  cash: "Cash",
  other: "Other",
};
