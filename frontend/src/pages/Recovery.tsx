import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { REMINDER_STATUS, dateFmt, money } from "@/lib/format";
import type { RecoveryRow, Reminder } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/DataTable";
import { PageHeader, StatusBadge } from "@/components/ui-bits";

interface RecoveryConfig {
  email_configured: boolean;
  provider: string | null;
  message: string;
}

// Payment recovery: overdue queue, dunning schedule and reminder history.
// Email delivery is not configured — the banner says so honestly.
export default function Recovery() {
  const qc = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ["recovery-config"],
    queryFn: () => apiGet<RecoveryConfig>("/recovery/config"),
  });
  const { data: queue, isLoading } = useQuery({
    queryKey: ["recovery-queue"],
    queryFn: () => apiGet<RecoveryRow[]>("/recovery/queue"),
  });
  const { data: reminders } = useQuery({
    queryKey: ["reminders"],
    queryFn: () => apiGet<Reminder[]>("/recovery/reminders"),
  });

  const markSent = useMutation({
    mutationFn: (id: string) => apiPost(`/recovery/reminders/${id}/mark-sent`),
    onSuccess: () => {
      toast.success("Reminder recorded as sent (manual — email not configured)");
      qc.invalidateQueries({ queryKey: ["reminders"] });
      qc.invalidateQueries({ queryKey: ["recovery-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Payment recovery"
        description="Overdue invoices with a dunning schedule: reminders at due +1, +3, +7 and +14 days."
      />

      {config && !config.email_configured ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" data-testid="recovery-email-not-configured">
          <p className="font-medium">Email delivery is not configured</p>
          <p className="mt-1 text-xs">{config.message}</p>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Overdue queue</p>
        <DataTable
          columns={[
            { key: "invoice_number", header: "Invoice", render: (r) => <span className="font-mono text-xs">{r.invoice_number}</span>, searchValue: (r) => r.invoice_number },
            { key: "customer_name", header: "Customer", searchValue: (r) => r.customer_name ?? "" },
            { key: "due_date", header: "Was due", render: (r) => dateFmt(r.due_date) },
            { key: "days_overdue", header: "Days overdue", align: "right", render: (r) => <span className="font-mono text-red-600">{r.days_overdue}</span> },
            { key: "bucket", header: "Age bucket" },
            { key: "balance_cents", header: "Balance", align: "right", render: (r) => money(r.balance_cents) },
            {
              key: "reminders",
              header: "Reminders",
              render: (r) => (
                <span className="text-xs text-slate-500">
                  {r.reminders_sent} sent · {r.reminders_scheduled} scheduled
                </span>
              ),
            },
          ]}
          rows={queue ?? []}
          loading={isLoading}
          rowTestId={(r) => `recovery-row-${r.invoice_id}`}
          searchPlaceholder="Search overdue invoices…"
          emptyTitle="Nothing overdue"
          emptyMessage="No invoice is past due — the recovery queue is clear."
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Reminder schedule & history</p>
        <DataTable
          columns={[
            { key: "invoice_number", header: "Invoice", render: (r) => <span className="font-mono text-xs">{r.invoice_number}</span>, searchValue: (r) => r.invoice_number ?? "" },
            { key: "customer_name", header: "Customer", searchValue: (r) => r.customer_name ?? "" },
            { key: "stage_label", header: "Stage" },
            { key: "scheduled_date", header: "Scheduled", render: (r) => dateFmt(r.scheduled_date) },
            {
              key: "status",
              header: "Status",
              render: (r) => {
                const conf = REMINDER_STATUS[r.status] ?? { label: r.status, tone: "slate" as const };
                return <StatusBadge label={conf.label} tone={conf.tone} testid={`reminder-status-${r.id}`} />;
              },
            },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (r) =>
                r.status === "scheduled" ? (
                  <Button variant="outline" size="xs" onClick={() => markSent.mutate(r.id)} data-testid={`reminder-mark-sent-${r.id}`}>
                    Mark sent
                  </Button>
                ) : (
                  <span className="text-xs text-slate-400">{r.sent_at ? `Sent ${dateFmt(r.sent_at)}` : "—"}</span>
                ),
            },
          ]}
          rows={reminders ?? []}
          searchPlaceholder="Search reminders…"
          emptyTitle="No reminders scheduled"
          emptyMessage="Reminders appear automatically when invoices pass their due date."
        />
      </div>
    </div>
  );
}
