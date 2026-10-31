import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { INVOICE_STATUS, METHOD_LABELS, dateFmt, money, pct, todayStr } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Customer, Invoice, Line, Payment } from "@/lib/types";
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

interface DraftLine {
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_bps: number;
  discount_cents: number;
}

export default function Invoices() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isStaff = me?.role === "ADMIN" || me?.role === "STAFF";
  const [statusFilter, setStatusFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => apiGet<Invoice[]>("/invoices"),
  });

  const filtered = (invoices ?? []).filter((i) => statusFilter === "all" || effectiveStatus(i) === statusFilter);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description={
          isStaff
            ? "Recurring and manual invoices. Billing runs generate them; record payments against the balance."
            : "Invoices issued to your company."
        }
        actions={
          isStaff ? (
            <Button onClick={() => setCreating(true)} data-testid="btn-create-invoice">
              New invoice
            </Button>
          ) : null
        }
      />
      <DataTable
        columns={[
          { key: "number", header: "Number", render: (i) => <span className="font-mono text-xs">{i.number}</span>, searchValue: (i) => i.number },
          { key: "customer_name", header: "Customer", searchValue: (i) => i.customer_name ?? "" },
          {
            key: "status",
            header: "Status",
            render: (i) => {
              const st = effectiveStatus(i);
              const conf = INVOICE_STATUS[st] ?? { label: st, tone: "slate" as const };
              return <StatusBadge label={conf.label} tone={conf.tone} testid={`invoice-status-${i.id}`} />;
            },
          },
          { key: "issue_date", header: "Issued", render: (i) => dateFmt(i.issue_date) },
          { key: "due_date", header: "Due", render: (i) => dateFmt(i.due_date) },
          { key: "total_cents", header: "Total", align: "right", render: (i) => money(i.total_cents) },
          {
            key: "balance_cents",
            header: "Balance",
            align: "right",
            render: (i) => <span className={i.balance_cents > 0 ? "text-red-600" : ""}>{money(i.balance_cents)}</span>,
          },
        ]}
        rows={filtered}
        loading={isLoading}
        rowTestId={(i) => `invoice-row-${i.id}`}
        searchPlaceholder="Search invoices…"
        onRowClick={(i) => setDetail(i)}
        toolbar={
          <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v)}>
            <SelectTrigger size="sm" className="w-36" data-testid="invoice-status-filter">
              <SelectValue>{INVOICE_STATUS[statusFilter]?.label ?? "All statuses"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="confirmed">Unpaid</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        }
        emptyTitle="No invoices"
        emptyMessage="Invoices appear from recurring billing or manual creation."
      />

      {creating ? <CreateDialog onClose={() => setCreating(false)} /> : null}
      {detail ? <DetailDialog invoice={detail} canAct={isStaff} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function effectiveStatus(inv: Invoice): string {
  const today = todayStr();
  if (inv.status === "confirmed" && inv.balance_cents > 0 && inv.due_date < today) return "overdue";
  return inv.status;
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => apiGet<Customer[]>("/customers") });
  const [customerId, setCustomerId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { description: "", quantity: 1, unit_price_cents: 0, tax_bps: 0, discount_cents: 0 },
  ]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiPost<Invoice>("/invoices", {
        customer_id: customerId,
        due_date: dueDate || null,
        notes,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity) || 1,
          unit_price_cents: Number(l.unit_price_cents) || 0,
          tax_bps: Number(l.tax_bps) || 0,
          discount_cents: Number(l.discount_cents) || 0,
        })),
      }),
    onSuccess: (inv) => {
      toast.success(`Invoice ${inv.number} created as draft`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const total = lines.reduce((acc, l) => {
    const subtotal = l.quantity * l.unit_price_cents;
    const taxable = subtotal - l.discount_cents;
    return acc + taxable + Math.round((taxable * l.tax_bps) / 10000);
  }, 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-testid="invoice-create-dialog">
        <DialogHeader>
          <DialogTitle>New invoice (draft)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" error={error}>
              <Select value={customerId || "none"} onValueChange={(v: string) => setCustomerId(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="invoice-customer-select">
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
            <Field label="Due date">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="invoice-due-date-input" />
            </Field>
          </div>

          {lines.map((line, idx) => (
            <div key={idx} className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-5" data-testid={`invoice-line-${idx}`}>
              <div className="sm:col-span-2">
                <Field label="Description">
                  <Input
                    value={line.description}
                    onChange={(e) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l)))}
                    data-testid={`invoice-line-description-${idx}`}
                  />
                </Field>
              </div>
              <Field label="Qty">
                <Input
                  type="number"
                  min="1"
                  value={line.quantity.toString()}
                  onChange={(e) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: Number(e.target.value) || 1 } : l)))}
                  data-testid={`invoice-line-qty-${idx}`}
                />
              </Field>
              <Field label="Unit price ($)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(line.unit_price_cents / 100).toString()}
                  onChange={(e) =>
                    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unit_price_cents: Math.round(Number(e.target.value) * 100) || 0 } : l)))
                  }
                  data-testid={`invoice-line-price-${idx}`}
                />
              </Field>
              <Field label="Tax %">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={(line.tax_bps / 100).toString()}
                  onChange={(e) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, tax_bps: Math.round(Number(e.target.value) * 100) || 0 } : l)))}
                  data-testid={`invoice-line-tax-${idx}`}
                />
              </Field>
            </div>
          ))}

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLines((prev) => [...prev, { description: "", quantity: 1, unit_price_cents: 0, tax_bps: 0, discount_cents: 0 }])}
              data-testid="btn-add-invoice-line"
            >
              Add line
            </Button>
            <p className="text-sm text-slate-700" data-testid="invoice-preview-total">
              Total preview: <span className="font-mono font-medium">{money(total)}</span>
            </p>
          </div>

          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="invoice-notes-input" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !customerId || lines.some((l) => !l.description.trim())}
            data-testid="invoice-save-button"
          >
            {create.isPending ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({ invoice, canAct, onClose }: { invoice: Invoice; canAct: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState((invoice.balance_cents / 100).toFixed(2));
  const [method, setMethod] = useState("card");
  const [error, setError] = useState<string | null>(null);

  const { data: payments } = useQuery({
    queryKey: ["payments", invoice.id],
    queryFn: () => apiGet<Payment[]>(`/payments?invoice_id=${invoice.id}`),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => apiPatch<Invoice>(`/invoices/${invoice.id}/status`, { status }),
    onSuccess: (_i, status) => {
      toast.success(status === "confirmed" ? "Invoice confirmed" : "Invoice cancelled");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordPayment = useMutation({
    mutationFn: () =>
      apiPost<Payment>("/payments", {
        invoice_id: invoice.id,
        amount_cents: Math.round(Number(amount) * 100) || 0,
        method,
        note: "",
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payments", invoice.id] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const st = effectiveStatus(invoice);
  const conf = INVOICE_STATUS[st] ?? { label: st, tone: "slate" as const };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-testid="invoice-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-base">{invoice.number}</span>
            <StatusBadge label={conf.label} tone={conf.tone} testid="invoice-detail-status" />
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2 text-sm text-slate-600">
          <p>
            Customer: <span className="font-medium text-slate-900">{invoice.customer_name}</span>
          </p>
          <p>
            Issued {dateFmt(invoice.issue_date)} · due {dateFmt(invoice.due_date)}
            {invoice.period_start ? ` · period ${dateFmt(invoice.period_start)} → ${dateFmt(invoice.period_end)}` : " · manual invoice"}
          </p>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit</th>
                <th className="px-3 py-2 text-right">Discount</th>
                <th className="px-3 py-2 text-right">Tax</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l: Line, i: number) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">{l.description}</td>
                  <td className="px-3 py-2 text-right font-mono">{l.quantity}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(l.unit_price_cents)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(l.discount_cents)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(l.tax_cents)} ({pct(l.tax_bps)})</td>
                  <td className="px-3 py-2 text-right font-mono">{money(l.line_total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto w-full max-w-xs text-sm">
          <div className="flex justify-between py-1 text-slate-600">
            <span>Subtotal</span>
            <span className="font-mono">{money(invoice.subtotal_cents)}</span>
          </div>
          <div className="flex justify-between py-1 text-slate-600">
            <span>Discounts</span>
            <span className="font-mono">−{money(invoice.discount_cents)}</span>
          </div>
          <div className="flex justify-between py-1 text-slate-600">
            <span>Tax</span>
            <span className="font-mono">{money(invoice.tax_cents)}</span>
          </div>
          <div className="flex justify-between py-1 font-semibold text-slate-900">
            <span>Total</span>
            <span className="font-mono">{money(invoice.total_cents)}</span>
          </div>
          <div className="flex justify-between py-1 text-slate-600">
            <span>Paid</span>
            <span className="font-mono">{money(invoice.amount_paid_cents)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <span>Balance</span>
            <span className="font-mono">{money(invoice.balance_cents)}</span>
          </div>
        </div>

        {(payments ?? []).length > 0 ? (
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payments</p>
            <ul className="mt-2 grid gap-1 text-sm text-slate-600">
              {(payments ?? []).map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>
                    <span className="font-mono text-xs">{p.number}</span> · {METHOD_LABELS[p.method] ?? p.method} · {dateFmt(p.paid_at)}
                  </span>
                  <span className="font-mono">{money(p.amount_cents)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? <p className="text-xs text-red-600" data-testid="invoice-action-error">{error}</p> : null}

        {canAct ? (
          <div className="grid gap-3 border-t border-slate-200 pt-4">
            {paying ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Amount ($)">
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="payment-amount-input" />
                </Field>
                <Field label="Method">
                  <Select value={method} onValueChange={(v: string) => setMethod(v)}>
                    <SelectTrigger data-testid="payment-method-select">
                      <SelectValue>{METHOD_LABELS[method]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(METHOD_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-end gap-2">
                  <Button onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending} data-testid="invoice-action-pay">
                    Record
                  </Button>
                  <Button variant="outline" onClick={() => setPaying(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-2">
                {invoice.status === "draft" ? (
                  <>
                    <Button onClick={() => setStatus.mutate("confirmed")} disabled={setStatus.isPending} data-testid="invoice-action-confirm">
                      Confirm
                    </Button>
                    <Button variant="outline" className="text-red-600" onClick={() => setStatus.mutate("cancelled")} disabled={setStatus.isPending} data-testid="invoice-action-cancel">
                      Cancel invoice
                    </Button>
                  </>
                ) : null}
                {invoice.status === "confirmed" && invoice.balance_cents > 0 ? (
                  <Button onClick={() => setPaying(true)} data-testid="btn-record-payment">
                    Record payment
                  </Button>
                ) : null}
                {invoice.status === "confirmed" ? (
                  <Button variant="outline" className="text-red-600" onClick={() => setStatus.mutate("cancelled")} disabled={setStatus.isPending} data-testid="invoice-action-cancel">
                    Cancel invoice
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
