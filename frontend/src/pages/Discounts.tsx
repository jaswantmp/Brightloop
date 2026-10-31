import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { money, pct } from "@/lib/format";
import type { Discount } from "@/lib/types";
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
import { Field, PageHeader } from "@/components/ui-bits";

const EMPTY: Discount = {
  id: "",
  name: "",
  type: "percentage",
  value: 1000,
  min_purchase_cents: 0,
  min_quantity: 0,
  start_date: null,
  end_date: null,
  usage_limit: null,
  used_count: 0,
};

export default function Discounts() {
  const qc = useQueryClient();
  const { data: discounts, isLoading } = useQuery({
    queryKey: ["discounts"],
    queryFn: () => apiGet<Discount[]>("/discounts"),
  });
  const [editing, setEditing] = useState<Discount | null>(null);

  const save = useMutation({
    mutationFn: (d: Discount) => {
      const body = {
        ...d,
        start_date: d.start_date || null,
        end_date: d.end_date || null,
        usage_limit: d.usage_limit,
      };
      return d.id ? apiPatch<Discount>(`/discounts/${d.id}`, body) : apiPost<Discount>("/discounts", body);
    },
    onSuccess: () => {
      toast.success("Discount saved");
      qc.invalidateQueries({ queryKey: ["discounts"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/discounts/${id}`),
    onSuccess: () => {
      toast.success("Discount deleted");
      qc.invalidateQueries({ queryKey: ["discounts"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Discounts"
        description="Fixed or percentage discounts with eligibility windows, minimums and usage limits. Admin-only."
        actions={
          <Button onClick={() => setEditing({ ...EMPTY })} data-testid="btn-create-discount">
            New discount
          </Button>
        }
      />
      <DataTable
        columns={[
          { key: "name", header: "Name", searchValue: (d) => d.name },
          {
            key: "value",
            header: "Value",
            render: (d) => (d.type === "fixed" ? `${money(d.value)} off` : `${pct(d.value)} off`),
          },
          {
            key: "requirements",
            header: "Requirements",
            render: (d) => {
              const parts: string[] = [];
              if (d.min_purchase_cents > 0) parts.push(`min ${money(d.min_purchase_cents)}`);
              if (d.min_quantity > 0) parts.push(`min qty ${d.min_quantity}`);
              if (d.start_date || d.end_date)
                parts.push(`${d.start_date ?? "start"} → ${d.end_date ?? "no end"}`);
              return <span className="text-xs text-slate-500">{parts.length ? parts.join(" · ") : "None"}</span>;
            },
          },
          {
            key: "usage",
            header: "Used",
            align: "right",
            render: (d) => (
              <span className="font-mono text-xs">
                {d.used_count}
                {d.usage_limit ? ` / ${d.usage_limit}` : ""}
              </span>
            ),
          },
        ]}
        rows={discounts ?? []}
        loading={isLoading}
        rowTestId={(d) => `discount-row-${d.id}`}
        searchPlaceholder="Search discounts…"
        onRowClick={(d) => setEditing(d)}
        emptyTitle="No discounts"
        emptyMessage="Discounts apply automatically to billing lines when eligible."
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg" data-testid="discount-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit discount" : "New discount"}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <Field label="Name">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="discount-name-input" />
              </Field>
              <Field label="Type">
                <Select value={editing.type} onValueChange={(v: string) => setEditing({ ...editing, type: v as Discount["type"], value: v === "fixed" ? 5000 : 1000 })}>
                  <SelectTrigger data-testid="discount-type-select">
                    <SelectValue>{editing.type === "fixed" ? "Fixed amount" : "Percentage"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={editing.type === "fixed" ? "Amount off ($)" : "Percent off (%)"}>
                <Input
                  type="number"
                  step={editing.type === "fixed" ? "0.01" : "0.1"}
                  min="0"
                  value={(editing.value / 100).toString()}
                  onChange={(e) => setEditing({ ...editing, value: Math.round(Number(e.target.value) * 100) || 0 })}
                  data-testid="discount-value-input"
                />
              </Field>
              <Field label="Minimum purchase ($)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(editing.min_purchase_cents / 100).toString()}
                  onChange={(e) => setEditing({ ...editing, min_purchase_cents: Math.round(Number(e.target.value) * 100) || 0 })}
                  data-testid="discount-min-purchase-input"
                />
              </Field>
              <Field label="Minimum quantity">
                <Input
                  type="number"
                  min="0"
                  value={editing.min_quantity.toString()}
                  onChange={(e) => setEditing({ ...editing, min_quantity: Number(e.target.value) || 0 })}
                  data-testid="discount-min-quantity-input"
                />
              </Field>
              <Field label="Usage limit (blank = unlimited)">
                <Input
                  type="number"
                  min="0"
                  value={editing.usage_limit?.toString() ?? ""}
                  onChange={(e) => setEditing({ ...editing, usage_limit: e.target.value ? Number(e.target.value) : null })}
                  data-testid="discount-usage-limit-input"
                />
              </Field>
              <Field label="Start date">
                <Input
                  type="date"
                  value={editing.start_date ?? ""}
                  onChange={(e) => setEditing({ ...editing, start_date: e.target.value || null })}
                  data-testid="discount-start-date-input"
                />
              </Field>
              <Field label="End date">
                <Input
                  type="date"
                  value={editing.end_date ?? ""}
                  onChange={(e) => setEditing({ ...editing, end_date: e.target.value || null })}
                  data-testid="discount-end-date-input"
                />
              </Field>
            </div>
          ) : null}
          <DialogFooter>
            {editing?.id ? (
              <Button variant="outline" className="mr-auto text-red-600" onClick={() => remove.mutate(editing.id)}>
                Delete
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending || !editing?.name.trim()} data-testid="discount-save-button">
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
