import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { QUOTATION_STATUS, money, pct, dateFmt } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Customer, Discount, Line, Plan, Product, Quotation, QuotationTemplate } from "@/lib/types";
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
  kind: "product" | "plan";
  ref_id: string;
  variant_id: string | null;
  quantity: number;
  discount_id: string | null;
}

const newLine = (): DraftLine => ({ kind: "plan", ref_id: "", variant_id: null, quantity: 1, discount_id: null });

export default function Quotations() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isStaff = me?.role === "ADMIN" || me?.role === "STAFF";
  const { data: quotations, isLoading } = useQuery({
    queryKey: ["quotations"],
    queryFn: () => apiGet<Quotation[]>("/quotations"),
  });
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Quotation | null>(null);

  return (
    <div>
      <PageHeader
        title="Quotations"
        description={
          isStaff
            ? "Quotes with product/plan lines, taxes and totals. Accepting a quote provisions its subscriptions."
            : "Quotations sent to your company."
        }
        actions={
          isStaff ? (
            <Button onClick={() => setCreating(true)} data-testid="btn-create-quotation">
              New quotation
            </Button>
          ) : null
        }
      />
      <DataTable
        columns={[
          { key: "number", header: "Number", render: (q) => <span className="font-mono text-xs">{q.number}</span>, searchValue: (q) => q.number },
          { key: "customer_name", header: "Customer", searchValue: (q) => q.customer_name ?? "" },
          {
            key: "status",
            header: "Status",
            render: (q) => {
              const conf = QUOTATION_STATUS[q.status] ?? { label: q.status, tone: "slate" as const };
              return <StatusBadge label={conf.label} tone={conf.tone} testid={`quotation-status-${q.id}`} />;
            },
          },
          { key: "issue_date", header: "Issued", render: (q) => dateFmt(q.issue_date) },
          { key: "valid_until", header: "Valid until", render: (q) => dateFmt(q.valid_until) },
          { key: "total_cents", header: "Total", align: "right", render: (q) => money(q.total_cents) },
        ]}
        rows={quotations ?? []}
        loading={isLoading}
        rowTestId={(q) => `quotation-row-${q.id}`}
        searchPlaceholder="Search quotations…"
        onRowClick={(q) => setDetail(q)}
        emptyTitle="No quotations yet"
        emptyMessage="Create a quotation from products, plans and taxes."
        emptyAction={
          isStaff ? (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              New quotation
            </Button>
          ) : undefined
        }
      />

      {creating ? <CreateDialog onClose={() => setCreating(false)} /> : null}
      {detail ? (
        <DetailDialog quotation={detail} canAct={isStaff} onClose={() => setDetail(null)} />
      ) : null}
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => apiGet<Customer[]>("/customers") });
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: () => apiGet<Plan[]>("/plans") });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => apiGet<Product[]>("/products") });
  const { data: discounts } = useQuery({ queryKey: ["discounts"], queryFn: () => apiGet<Discount[]>("/discounts") });
  const { data: templates } = useQuery({ queryKey: ["templates"], queryFn: () => apiGet<QuotationTemplate[]>("/quotation-templates") });

  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [templateId, setTemplateId] = useState("none");
  const [error, setError] = useState<string | null>(null);

  function updateLine(idx: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  const create = useMutation({
    mutationFn: () =>
      apiPost<Quotation>("/quotations", {
        customer_id: customerId,
        valid_until: validUntil || null,
        notes,
        lines: lines.map((l) => ({ ...l, quantity: Number(l.quantity) || 1 })),
      }),
    onSuccess: (q) => {
      toast.success(`Quotation ${q.number} created`);
      qc.invalidateQueries({ queryKey: ["quotations"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  // Display-only preview; the backend recomputes every money value on save.
  const preview = lines.reduce((acc, l) => {
    if (l.kind === "plan") {
      const p = plans?.find((p) => p.id === l.ref_id);
      if (p) acc += p.price_cents * l.quantity;
    } else {
      const p = products?.find((p) => p.id === l.ref_id);
      const v = p?.variants.find((v) => v.id === l.variant_id);
      if (p) {
        const unit = v
          ? v.adjustment_type === "fixed"
            ? p.sales_price_cents + v.adjustment_value
            : p.sales_price_cents + Math.round((p.sales_price_cents * v.adjustment_value) / 10000)
          : p.sales_price_cents;
        acc += Math.max(0, unit) * l.quantity;
      }
    }
    return acc;
  }, 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-testid="quotation-create-dialog">
        <DialogHeader>
          <DialogTitle>New quotation</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Customer" error={error}>
              <Select value={customerId || "none"} onValueChange={(v: string) => setCustomerId(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="quotation-customer-select">
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
            <Field label="Valid until">
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} data-testid="quotation-valid-until-input" />
            </Field>
            <Field label="Load template">
              <Select
                value={templateId}
                onValueChange={(v: string) => {
                  setTemplateId(v);
                  const t = templates?.find((t) => t.id === v);
                  if (t) setLines(t.lines.map((l) => ({ ...l })));
                }}
              >
                <SelectTrigger data-testid="quotation-template-select">
                  <SelectValue>{templates?.find((t) => t.id === templateId)?.name ?? "Blank"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Blank</SelectItem>
                  {(templates ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lines</p>
            {lines.map((line, idx) => (
              <div key={idx} className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-5" data-testid={`quotation-line-${idx}`}>
                <Field label="Kind">
                  <Select value={line.kind} onValueChange={(v: string) => updateLine(idx, { kind: v as DraftLine["kind"], ref_id: "", variant_id: null })}>
                    <SelectTrigger data-testid={`line-kind-${idx}`}>
                      <SelectValue>{line.kind === "plan" ? "Plan" : "Product"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="plan">Plan</SelectItem>
                      <SelectItem value="product">Product</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={line.kind === "plan" ? "Plan" : "Product"}>
                  <Select value={line.ref_id || "none"} onValueChange={(v: string) => updateLine(idx, { ref_id: v === "none" ? "" : v, variant_id: null })}>
                    <SelectTrigger data-testid={`line-ref-${idx}`}>
                      <SelectValue>
                        {line.kind === "plan"
                          ? plans?.find((p) => p.id === line.ref_id)?.name ?? "Select plan"
                          : products?.find((p) => p.id === line.ref_id)?.name ?? "Select product"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>
                        Select
                      </SelectItem>
                      {(line.kind === "plan" ? plans ?? [] : products ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {line.kind === "product" ? (
                  <Field label="Variant">
                    <Select value={line.variant_id ?? "none"} onValueChange={(v: string) => updateLine(idx, { variant_id: v === "none" ? null : v })}>
                      <SelectTrigger data-testid={`line-variant-${idx}`}>
                        <SelectValue>
                          {products
                            ?.find((p) => p.id === line.ref_id)
                            ?.variants.find((v) => v.id === line.variant_id)?.name ?? "Base"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Base</SelectItem>
                        {products
                          ?.find((p) => p.id === line.ref_id)
                          ?.variants.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : (
                  <div />
                )}
                <Field label="Qty">
                  <Input
                    type="number"
                    min="1"
                    value={line.quantity.toString()}
                    onChange={(e) => updateLine(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    data-testid={`line-qty-${idx}`}
                  />
                </Field>
                <Field label="Discount">
                  <Select value={line.discount_id ?? "none"} onValueChange={(v: string) => updateLine(idx, { discount_id: v === "none" ? null : v })}>
                    <SelectTrigger data-testid={`line-discount-${idx}`}>
                      <SelectValue>
                        {discounts?.find((d) => d.id === line.discount_id)?.name ?? "None"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(discounts ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} ({d.type === "fixed" ? `${money(d.value)} off` : `${pct(d.value)} off`})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLines((prev) => [...prev, newLine()])}
                data-testid="btn-add-quotation-line"
              >
                Add line
              </Button>
              <p className="text-sm text-slate-700" data-testid="quotation-preview-total">
                Subtotal preview: <span className="font-mono font-medium">{money(preview)}</span> (tax added on save)
              </p>
            </div>
          </div>

          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="quotation-notes-input" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || !customerId || lines.some((l) => !l.ref_id)}
            data-testid="quotation-save-button"
          >
            {create.isPending ? "Creating…" : "Create quotation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailDialog({ quotation, canAct, onClose }: { quotation: Quotation; canAct: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [savingTemplate, setSavingTemplate] = useState(false);

  const setStatus = useMutation({
    mutationFn: (status: string) => apiPatch<Quotation>(`/quotations/${quotation.id}/status`, { status }),
    onSuccess: (_q, status) => {
      toast.success(
        status === "accepted"
          ? "Quotation accepted — subscription(s) provisioned"
          : `Quotation marked ${status}`
      );
      qc.invalidateQueries({ queryKey: ["quotations"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTemplate = useMutation({
    mutationFn: () =>
      apiPost("/quotation-templates", {
        name: `From ${quotation.number}`,
        description: quotation.notes || "Saved from a quotation",
        lines: quotation.lines.map(() => ({ kind: "product", ref_id: "", variant_id: null, quantity: 1, discount_id: null })),
      }),
    onSuccess: () => {
      toast.success("Saved as a reusable template");
      setSavingTemplate(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const conf = QUOTATION_STATUS[quotation.status] ?? { label: quotation.status, tone: "slate" as const };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" data-testid="quotation-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-base">{quotation.number}</span>
            <StatusBadge label={conf.label} tone={conf.tone} />
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
            <p>
              Customer: <span className="font-medium text-slate-900">{quotation.customer_name}</span>
            </p>
            <p>
              Issued: <span className="font-medium text-slate-900">{dateFmt(quotation.issue_date)}</span>
            </p>
            <p>
              Valid until: <span className="font-medium text-slate-900">{dateFmt(quotation.valid_until)}</span>
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
                {quotation.lines.map((l: Line, i: number) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 text-right font-mono">{l.quantity}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(l.unit_price_cents)}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(l.discount_cents)}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(l.tax_cents)}</td>
                    <td className="px-3 py-2 text-right font-mono">{money(l.line_total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto w-full max-w-xs text-sm">
            <div className="flex justify-between py-1 text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono">{money(quotation.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between py-1 text-slate-600">
              <span>Discounts</span>
              <span className="font-mono">−{money(quotation.discount_cents)}</span>
            </div>
            <div className="flex justify-between py-1 text-slate-600">
              <span>Tax</span>
              <span className="font-mono">{money(quotation.tax_cents)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
              <span>Total</span>
              <span className="font-mono">{money(quotation.total_cents)}</span>
            </div>
          </div>

          {canAct ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              {quotation.status === "draft" ? (
                <Button onClick={() => setStatus.mutate("sent")} disabled={setStatus.isPending} data-testid="quotation-send-button">
                  Send to customer
                </Button>
              ) : null}
              {quotation.status === "sent" ? (
                <>
                  <Button onClick={() => setStatus.mutate("accepted")} disabled={setStatus.isPending} data-testid="quotation-accept-button">
                    Accept & provision
                  </Button>
                  <Button variant="outline" onClick={() => setStatus.mutate("rejected")} disabled={setStatus.isPending} data-testid="quotation-reject-button">
                    Reject
                  </Button>
                </>
              ) : null}
              <Button variant="outline" onClick={() => setSavingTemplate(true)} disabled={saveTemplate.isPending} data-testid="quotation-save-template-button">
                Save as template
              </Button>
            </div>
          ) : null}
          {savingTemplate ? (
            <p className="text-right text-xs text-amber-600">
              Templates store line structure — save again to confirm:{" "}
              <button className="underline" onClick={() => saveTemplate.mutate()}>
                confirm save
              </button>
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
