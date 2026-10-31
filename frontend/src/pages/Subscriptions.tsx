import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { PERIOD_LABELS, SUBSCRIPTION_STATUS, dateFmt, money, pct } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { BillingRun, Customer, Plan, Subscription } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/DataTable";
import { Field, PageHeader, StatusBadge } from "@/components/ui-bits";

export default function Subscriptions() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isStaff = me?.role === "ADMIN" || me?.role === "STAFF";
  const [statusFilter, setStatusFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Subscription | null>(null);

  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => apiGet<Subscription[]>("/subscriptions"),
  });

  const billingRun = useMutation({
    mutationFn: () => apiPost<BillingRun>("/invoices/billing/run"),
    onSuccess: (res) => {
      toast.success(
        `Billing run: ${res.invoices_created} invoice${res.invoices_created === 1 ? "" : "s"} created` +
          (res.subscriptions_closed.length ? `, ${res.subscriptions_closed.length} subscription(s) auto-closed` : "")
      );
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (subscriptions ?? []).filter((s) => statusFilter === "all" || s.status === statusFilter);

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description={
          isStaff
            ? "Lifecycle: Draft → Quotation → Confirmed → Active → Closed. Billing generates invoices per period."
            : "Your subscriptions and their status."
        }
        actions={
          <>
            {isStaff ? (
              <Button variant="outline" onClick={() => billingRun.mutate()} disabled={billingRun.isPending} data-testid="btn-run-billing">
                {billingRun.isPending ? "Running…" : "Run billing now"}
              </Button>
            ) : null}
            {isStaff ? (
              <Button onClick={() => setCreating(true)} data-testid="btn-create-subscription">
                New subscription
              </Button>
            ) : null}
          </>
        }
      />
      <DataTable
        columns={[
          { key: "number", header: "Number", render: (s) => <span className="font-mono text-xs">{s.number}</span>, searchValue: (s) => s.number },
          { key: "customer_name", header: "Customer", searchValue: (s) => s.customer_name ?? "" },
          { key: "plan_name", header: "Plan", searchValue: (s) => s.plan_name ?? "" },
          {
            key: "status",
            header: "Status",
            render: (s) => {
              const conf = SUBSCRIPTION_STATUS[s.status] ?? { label: s.status, tone: "slate" as const };
              return (
                <StatusBadge
                  label={s.paused && s.status === "active" ? "Paused" : conf.label}
                  tone={s.paused && s.status === "active" ? "amber" : conf.tone}
                  testid={`subscription-status-${s.id}`}
                />
              );
            },
          },
          { key: "billing_period", header: "Billing", render: (s) => PERIOD_LABELS[s.billing_period] ?? s.billing_period },
          { key: "amount", header: "Amount", align: "right", render: (s) => `${money(s.unit_price_cents)} × ${s.quantity}` },
          { key: "next_billing_date", header: "Next bill", render: (s) => dateFmt(s.next_billing_date) },
        ]}
        rows={filtered}
        loading={isLoading}
        rowTestId={(s) => `subscription-row-${s.id}`}
        searchPlaceholder="Search subscriptions…"
        onRowClick={(s) => setDetail(s)}
        toolbar={
          <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v)}>
            <SelectTrigger size="sm" className="w-36" data-testid="subscription-status-filter">
              <SelectValue>{statusFilter === "all" ? "All statuses" : SUBSCRIPTION_STATUS[statusFilter]?.label ?? statusFilter}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(SUBSCRIPTION_STATUS).map(([value, conf]) => (
                <SelectItem key={value} value={value}>
                  {conf.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        emptyTitle="No subscriptions"
        emptyMessage={isStaff ? "Create a subscription from a plan to start recurring billing." : "No subscriptions yet."}
        emptyAction={
          isStaff ? (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              New subscription
            </Button>
          ) : undefined
        }
      />

      {creating ? <CreateDialog onClose={() => setCreating(false)} /> : null}
      {detail ? <DetailDialog subscription={detail} canAct={isStaff} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => apiGet<Customer[]>("/customers") });
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => apiGet<Plan[]>("/plans") });
  const [customerId, setCustomerId] = useState("");
  const [planId, setPlanId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const plan = plans?.find((p) => p.id === planId);

  const create = useMutation({
    mutationFn: () =>
      apiPost<Subscription>("/subscriptions", {
        customer_id: customerId,
        plan_id: planId,
        quantity: Number(quantity) || 1,
        start_date: startDate || null,
        payment_terms_days: 30,
      }),
    onSuccess: (s) => {
      toast.success(`Subscription ${s.number} created as draft`);
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="subscription-create-dialog">
        <DialogHeader>
          <DialogTitle>New subscription</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Customer" error={error}>
            <Select value={customerId || "none"} onValueChange={(v: string) => setCustomerId(v === "none" ? "" : v)}>
              <SelectTrigger data-testid="subscription-customer-select">
                <SelectValue>{customers?.find((c) => c.id === customerId)?.name ?? "Select customer"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>
                  Select customer
                </SelectItem>
                {(customers ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {c.company}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Plan">
            <Select value={planId || "none"} onValueChange={(v: string) => setPlanId(v === "none" ? "" : v)}>
              <SelectTrigger data-testid="subscription-plan-select">
                <SelectValue>{plan?.name ?? "Select plan"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>
                  Select plan
                </SelectItem>
                {(plans ?? [])
                  .filter((p) => p.active)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {money(p.price_cents)} / {p.billing_period}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={`Quantity${plan ? ` (min ${plan.min_quantity})` : ""}`}>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="subscription-quantity-input" />
            </Field>
            <Field label="Start date">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="subscription-start-date-input" />
            </Field>
          </div>
          {plan ? (
            <p className="text-xs text-slate-500">
              {money(plan.price_cents)} per {plan.billing_period} · tax {pct(plan.tax_id ? 0 : 0)}
              {plan.tax_id ? "" : " (default tax applied on billing)"}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !customerId || !planId}
            data-testid="subscription-save-button"
          >
            {create.isPending ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({ subscription, canAct, onClose }: { subscription: Subscription; canAct: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const action = useMutation({
    mutationFn: (act: string) =>
      apiPost<Subscription>(`/subscriptions/${subscription.id}/actions`, { action: act }),
    onSuccess: (s, act) => {
      toast.success(
        {
          create_quotation: "Quotation created and sent",
          confirm: "Subscription confirmed",
          activate: "Subscription activated — billing starts",
          pause: "Subscription paused (billing skipped while paused)",
          resume: "Subscription resumed",
          close: "Subscription closed",
          renew: "Subscription renewed",
        }[act] ?? "Action applied"
      );
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["quotations"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const conf = SUBSCRIPTION_STATUS[subscription.status] ?? { label: subscription.status, tone: "slate" as const };
  const status = subscription.status;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="subscription-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-base">{subscription.number}</span>
            <StatusBadge label={subscription.paused && status === "active" ? "Paused" : conf.label} tone={subscription.paused && status === "active" ? "amber" : conf.tone} testid="subscription-detail-status" />
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2 text-sm text-slate-600">
          <p>
            Customer: <span className="font-medium text-slate-900">{subscription.customer_name}</span>
          </p>
          <p>
            Plan: <span className="font-medium text-slate-900">{subscription.plan_name}</span> ·{" "}
            {PERIOD_LABELS[subscription.billing_period]} billing · {money(subscription.unit_price_cents)} ×{" "}
            {subscription.quantity} · tax {pct(subscription.tax_bps)}
          </p>
          <p>
            Started: <span className="font-medium text-slate-900">{dateFmt(subscription.start_date)}</span>
            {subscription.end_date ? ` · ends ${dateFmt(subscription.end_date)}` : ""}
            {subscription.next_billing_date && status === "active" ? ` · next bill ${dateFmt(subscription.next_billing_date)}` : ""}
          </p>
          {subscription.close_reason ? (
            <p>
              Closed: <span className="font-medium text-slate-900">{subscription.close_reason}</span>
            </p>
          ) : null}
        </div>
        {error ? <p className="text-xs text-red-600" data-testid="subscription-action-error">{error}</p> : null}
        {canAct ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4" data-testid="subscription-actions">
            {status === "draft" ? (
              <>
                <Button variant="outline" onClick={() => action.mutate("create_quotation")} disabled={action.isPending} data-testid="subscription-action-create-quotation">
                  Create quotation
                </Button>
                <Button onClick={() => action.mutate("confirm")} disabled={action.isPending} data-testid="subscription-action-confirm">
                  Confirm
                </Button>
              </>
            ) : null}
            {status === "quotation" ? (
              <Button onClick={() => action.mutate("confirm")} disabled={action.isPending} data-testid="subscription-action-confirm">
                Confirm
              </Button>
            ) : null}
            {status === "confirmed" ? (
              <Button onClick={() => action.mutate("activate")} disabled={action.isPending} data-testid="subscription-action-activate">
                Activate
              </Button>
            ) : null}
            {status === "active" && !subscription.paused ? (
              <>
                <Button variant="outline" onClick={() => action.mutate("pause")} disabled={action.isPending} data-testid="subscription-action-pause">
                  Pause
                </Button>
                <Button variant="outline" onClick={() => action.mutate("renew")} disabled={action.isPending} data-testid="subscription-action-renew">
                  Renew
                </Button>
                <Button variant="outline" className="text-red-600" onClick={() => action.mutate("close")} disabled={action.isPending} data-testid="subscription-action-cancel">
                  Close
                </Button>
              </>
            ) : null}
            {status === "active" && subscription.paused ? (
              <Button onClick={() => action.mutate("resume")} disabled={action.isPending} data-testid="subscription-action-resume">
                Resume
              </Button>
            ) : null}
            {status === "closed" ? (
              <Button variant="outline" onClick={() => action.mutate("renew")} disabled={action.isPending} data-testid="subscription-action-renew">
                Renew
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
