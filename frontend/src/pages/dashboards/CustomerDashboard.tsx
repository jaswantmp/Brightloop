import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { METHOD_LABELS, PERIOD_LABELS, money, dateFmt } from "@/lib/format";
import type { PortalData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/DataTable";
import { EmptyState, Field, StatCard, StatusBadge } from "@/components/ui-bits";

// CUSTOMER view: the customer portal. Every record here is scoped server-side
// to the signed-in customer — another customer's data cannot be reached by URL.
export function CustomerDashboard() {
  const qc = useQueryClient();
  const [requestFor, setRequestFor] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["portal-dashboard"],
    queryFn: () => apiGet<PortalData>("/reports/portal"),
  });

  const renew = useMutation({
    mutationFn: (id: string) => apiPost(`/subscriptions/${id}/renew-self`),
    onSuccess: () => {
      toast.success("Subscription renewed for another term");
      qc.invalidateQueries({ queryKey: ["portal-dashboard"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const k = data?.kpis;

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Your account</h2>
        <p className="mt-1 text-sm text-slate-500">
          Subscriptions, invoices and payments for your company — nothing else.
        </p>
      </div>

      {isError ? (
        <EmptyState
          title="Account data unavailable"
          message="We could not load your records just now. They will appear as soon as the service responds."
          testid="portal-error"
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active subscriptions" value={k ? String(k.active_subs) : "—"} testid="portal-kpi-active-subs" />
        <StatCard
          label="Outstanding balance"
          value={k ? money(k.outstanding_cents) : "—"}
          sub={k && k.overdue_count > 0 ? `${k.overdue_count} overdue invoice${k.overdue_count === 1 ? "" : "s"}` : "All on schedule"}
          tone={k && k.overdue_count > 0 ? "warning" : "default"}
          testid="portal-kpi-outstanding"
        />
        <StatCard
          label="Next payment due"
          value={k?.next_due_date ? dateFmt(k.next_due_date) : "—"}
          testid="portal-kpi-next-due"
        />
        <StatCard label="Paid (last 12 months)" value={k ? money(k.paid_last_12m_cents) : "—"} testid="portal-kpi-paid" />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Your subscriptions</p>
        <DataTable
          columns={[
            { key: "number", header: "Number", render: (r) => <span className="font-mono text-xs">{r.number}</span>, searchValue: (r) => r.number },
            { key: "plan_name", header: "Plan", searchValue: (r) => r.plan_name ?? "" },
            {
              key: "status",
              header: "Status",
              render: (r) => (
                <StatusBadge
                  label={r.paused ? "Paused" : r.status}
                  tone={r.paused ? "amber" : r.status === "active" ? "emerald" : "slate"}
                  testid={`portal-sub-status-${r.id}`}
                />
              ),
            },
            { key: "billing_period", header: "Billing", render: (r) => PERIOD_LABELS[r.billing_period] ?? r.billing_period },
            { key: "unit_price_cents", header: "Price", align: "right", render: (r) => `${money(r.unit_price_cents)} x ${r.quantity}` },
            { key: "next_billing_date", header: "Next bill", render: (r) => dateFmt(r.next_billing_date) },
            {
              key: "actions",
              header: "Actions",
              align: "right",
              render: (r) => (
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setRequestFor(r.id)}
                    data-testid={`portal-request-change-${r.id}`}
                  >
                    Request change
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={renew.isPending}
                    onClick={() => renew.mutate(r.id)}
                    data-testid={`portal-renew-${r.id}`}
                  >
                    Renew
                  </Button>
                </div>
              ),
            },
          ]}
          rows={data?.active_subscriptions ?? []}
          loading={isLoading}
          searchPlaceholder="Search subscriptions…"
          emptyTitle="No active subscriptions"
          emptyMessage="When a subscription is confirmed it will appear here with its billing schedule."
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">
          Open invoices{" "}
          <Link to="/invoices" className="ml-1 text-xs font-medium text-slate-500 underline underline-offset-4">
            view all invoices
          </Link>
        </p>
        <DataTable
          columns={[
            { key: "number", header: "Invoice", render: (r) => <span className="font-mono text-xs">{r.number}</span>, searchValue: (r) => r.number },
            { key: "issue_date", header: "Issued", render: (r) => dateFmt(r.issue_date) },
            { key: "due_date", header: "Due", render: (r) => dateFmt(r.due_date) },
            { key: "total_cents", header: "Total", align: "right", render: (r) => money(r.total_cents) },
            { key: "balance_cents", header: "Balance", align: "right", render: (r) => <span className={r.balance_cents > 0 ? "text-red-600" : ""}>{money(r.balance_cents)}</span> },
          ]}
          rows={data?.open_invoices ?? []}
          loading={isLoading}
          searchPlaceholder="Search invoices…"
          emptyTitle="No open invoices"
          emptyMessage="You're all settled — unpaid invoices will show here."
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Recent payments</p>
        <DataTable
          columns={[
            { key: "number", header: "Payment", render: (r) => <span className="font-mono text-xs">{r.number}</span>, searchValue: (r) => r.number },
            { key: "paid_at", header: "Date", render: (r) => dateFmt(r.paid_at) },
            { key: "method", header: "Method", render: (r) => METHOD_LABELS[r.method] ?? r.method },
            { key: "amount_cents", header: "Amount", align: "right", render: (r) => money(r.amount_cents) },
          ]}
          rows={data?.recent_payments ?? []}
          loading={isLoading}
          searchPlaceholder="Search payments…"
          emptyTitle="No payments yet"
        />
      </div>

      <ChangeRequestDialog
        subscriptionId={requestFor}
        onClose={() => setRequestFor(null)}
      />
    </div>
  );
}

function ChangeRequestDialog({
  subscriptionId,
  onClose,
}: {
  subscriptionId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [type, setType] = useState("pause");
  const [quantityNew, setQuantityNew] = useState("1");
  const [details, setDetails] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      apiPost("/subscriptions/change-requests", {
        subscription_id: subscriptionId,
        type,
        details,
        quantity_new: type === "quantity_change" ? Number(quantityNew) : null,
      }),
    onSuccess: () => {
      toast.success("Request submitted — our team will review it");
      qc.invalidateQueries({ queryKey: ["change-requests"] });
      onClose();
      setDetails("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={subscriptionId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="change-request-dialog">
        <DialogHeader>
          <DialogTitle>Request a subscription change</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Change type">
            <Select value={type} onValueChange={(v: string) => setType(v)}>
              <SelectTrigger data-testid="change-request-type-select">
                <SelectValue>{type.replace("_", " ")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pause">Pause</SelectItem>
                <SelectItem value="resume">Resume</SelectItem>
                <SelectItem value="quantity_change">Change quantity</SelectItem>
                <SelectItem value="renew">Renew</SelectItem>
                <SelectItem value="cancel">Cancel</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {type === "quantity_change" ? (
            <Field label="New quantity">
              <Input
                type="number"
                min={1}
                value={quantityNew}
                onChange={(e) => setQuantityNew(e.target.value)}
                data-testid="change-request-quantity-input"
              />
            </Field>
          ) : null}
          <Field label="Details">
            <Input
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything the team should know"
              data-testid="change-request-details-input"
            />
          </Field>
          <p className="text-xs text-slate-500">
            Requests are reviewed by our team before anything changes — nothing is applied
            immediately.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="change-request-cancel-button">
            Cancel
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
            data-testid="change-request-submit-button"
          >
            {submit.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
