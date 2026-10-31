import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { PERIOD_LABELS, money, pct } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Plan, Tax } from "@/lib/types";
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
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/DataTable";
import { Field, PageHeader, StatusBadge } from "@/components/ui-bits";

const EMPTY: Plan = {
  id: "",
  name: "",
  description: "",
  billing_period: "monthly",
  price_cents: 0,
  min_quantity: 1,
  available_from: null,
  available_to: null,
  auto_close: true,
  allow_pause: true,
  allow_renewal: true,
  allow_early_close: true,
  tax_id: null,
  active: true,
  created_at: "",
};

export default function Plans() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "ADMIN";
  const { data: plans, isLoading } = useQuery({
    queryKey: ["plans"],
    queryFn: () => apiGet<Plan[]>("/plans"),
  });
  const { data: taxes } = useQuery({ queryKey: ["taxes"], queryFn: () => apiGet<Tax[]>("/taxes") });
  const [editing, setEditing] = useState<Plan | null>(null);

  const save = useMutation({
    mutationFn: (p: Plan) => {
      const body = { ...p, tax_id: p.tax_id || null, available_from: p.available_from || null, available_to: p.available_to || null };
      return p.id ? apiPatch<Plan>(`/plans/${p.id}`, body) : apiPost<Plan>("/plans", body);
    },
    onSuccess: () => {
      toast.success("Plan saved");
      qc.invalidateQueries({ queryKey: ["plans"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => apiDelete(`/plans/${id}`),
    onSuccess: () => {
      toast.success("Plan archived");
      qc.invalidateQueries({ queryKey: ["plans"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Plans"
        description="Recurring plans with billing cadence and lifecycle rules (pause, renewal, early closure, auto-close)."
        actions={
          isAdmin ? (
            <Button onClick={() => setEditing({ ...EMPTY })} data-testid="btn-create-plan">
              New plan
            </Button>
          ) : (
            <span className="text-xs text-slate-500">Read-only — admins manage plans</span>
          )
        }
      />
      <DataTable
        columns={[
          { key: "name", header: "Plan", searchValue: (p) => p.name },
          { key: "billing_period", header: "Billing", render: (p) => PERIOD_LABELS[p.billing_period] ?? p.billing_period },
          { key: "price", header: "Price", align: "right", render: (p) => money(p.price_cents) },
          { key: "min_quantity", header: "Min qty", align: "right" },
          {
            key: "rules",
            header: "Lifecycle rules",
            render: (p) => (
              <span className="text-xs text-slate-500">
                {[
                  p.allow_pause ? "pause" : null,
                  p.allow_renewal ? "renew" : null,
                  p.allow_early_close ? "early close" : null,
                  p.auto_close ? "auto-close" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (p) => (
              <StatusBadge label={p.active ? "Active" : "Archived"} tone={p.active ? "emerald" : "slate"} testid={`plan-status-${p.id}`} />
            ),
          },
        ]}
        rows={plans ?? []}
        loading={isLoading}
        rowTestId={(p) => `plan-row-${p.id}`}
        searchPlaceholder="Search plans…"
        onRowClick={isAdmin ? (p) => setEditing(p) : undefined}
        emptyTitle="No plans yet"
        emptyMessage="Plans define recurring billing cadence and rules."
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="plan-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit plan" : "New plan"}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <Field label="Name">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="plan-name-input" />
              </Field>
              <Field label="Billing period">
                <Select value={editing.billing_period} onValueChange={(v: string) => setEditing({ ...editing, billing_period: v as Plan["billing_period"] })}>
                  <SelectTrigger data-testid="plan-period-select">
                    <SelectValue>{PERIOD_LABELS[editing.billing_period]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Price ($)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(editing.price_cents / 100).toString()}
                  onChange={(e) => setEditing({ ...editing, price_cents: Math.round(Number(e.target.value) * 100) || 0 })}
                  data-testid="plan-price-input"
                />
              </Field>
              <Field label="Minimum quantity">
                <Input
                  type="number"
                  min="1"
                  value={editing.min_quantity.toString()}
                  onChange={(e) => setEditing({ ...editing, min_quantity: Math.max(1, Number(e.target.value) || 1) })}
                  data-testid="plan-min-quantity-input"
                />
              </Field>
              <Field label="Available from">
                <Input
                  type="date"
                  value={editing.available_from ?? ""}
                  onChange={(e) => setEditing({ ...editing, available_from: e.target.value || null })}
                  data-testid="plan-available-from-input"
                />
              </Field>
              <Field label="Available to">
                <Input
                  type="date"
                  value={editing.available_to ?? ""}
                  onChange={(e) => setEditing({ ...editing, available_to: e.target.value || null })}
                  data-testid="plan-available-to-input"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Tax">
                  <Select
                    value={editing.tax_id ?? "none"}
                    onValueChange={(v: string) => setEditing({ ...editing, tax_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger data-testid="plan-tax-select">
                      <SelectValue>
                        {taxes?.find((t) => t.id === editing.tax_id)
                          ? `${taxes.find((t) => t.id === editing.tax_id)!.name} (${pct(taxes.find((t) => t.id === editing.tax_id)!.rate_bps)})`
                          : "Default tax"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Default tax</SelectItem>
                      {(taxes ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} ({pct(t.rate_bps)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                {(
                  [
                    ["allow_pause", "Allow pause/resume"],
                    ["allow_renewal", "Allow renewal"],
                    ["allow_early_close", "Allow early closure"],
                    ["auto_close", "Auto-close when the window lapses"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox
                      checked={editing[key]}
                      onCheckedChange={(checked) => setEditing({ ...editing, [key]: checked === true })}
                      data-testid={`plan-${key.replace(/_/g, "-")}-checkbox`}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="sm:col-span-2">
                <Field label="Description">
                  <Input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} data-testid="plan-description-input" />
                </Field>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            {editing?.id ? (
              <Button variant="outline" className="mr-auto text-red-600" onClick={() => archive.mutate(editing.id)}>
                Archive
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending || !editing?.name.trim()} data-testid="plan-save-button">
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
