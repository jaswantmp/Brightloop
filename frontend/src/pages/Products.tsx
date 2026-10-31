import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { money, pct } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Product, Variant } from "@/lib/types";
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
import { EmptyState, Field, PageHeader, StatusBadge } from "@/components/ui-bits";

const EMPTY: Product = {
  id: "",
  name: "",
  type: "product",
  sales_price_cents: 0,
  cost_price_cents: 0,
  notes: "",
  tax_id: null,
  active: true,
  created_at: "",
  variants: [],
};

export default function Products() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.role === "ADMIN";
  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiGet<Product[]>("/products"),
  });
  const { data: taxes } = useQuery({
    queryKey: ["taxes"],
    queryFn: () => apiGet("/taxes"),
  });
  const [editing, setEditing] = useState<Product | null>(null);
  const [variantFor, setVariantFor] = useState<Product | null>(null);

  const save = useMutation({
    mutationFn: (p: Product) =>
      p.id ? apiPatch<Product>(`/products/${p.id}`, p) : apiPost<Product>("/products", p),
    onSuccess: () => {
      toast.success("Product saved");
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => apiDelete(`/products/${id}`),
    onSuccess: () => {
      toast.success("Product archived");
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Products"
        description="One-off products and services with pricing variants. Variants adjust the sales price."
        actions={
          isAdmin ? (
            <Button onClick={() => setEditing({ ...EMPTY })} data-testid="btn-create-product">
              New product
            </Button>
          ) : (
            <span className="text-xs text-slate-500">Read-only — admins manage products</span>
          )
        }
      />
      <DataTable
        columns={[
          { key: "name", header: "Product", searchValue: (p) => p.name },
          { key: "type", header: "Type", render: (p) => (p.type === "service" ? "Service" : "Product") },
          { key: "sales", header: "Sales price", align: "right", render: (p) => money(p.sales_price_cents) },
          { key: "cost", header: "Cost price", align: "right", render: (p) => money(p.cost_price_cents) },
          {
            key: "margin",
            header: "Margin",
            align: "right",
            render: (p) => money(p.sales_price_cents - p.cost_price_cents),
          },
          {
            key: "variants",
            header: "Variants",
            render: (p) => (
              <Button variant="outline" size="xs" onClick={() => setVariantFor(p)} data-testid={`variants-open-${p.id}`}>
                {p.variants.length} variant{p.variants.length === 1 ? "" : "s"}
              </Button>
            ),
          },
          {
            key: "status",
            header: "Status",
            render: (p) => (
              <StatusBadge label={p.active ? "Active" : "Archived"} tone={p.active ? "emerald" : "slate"} testid={`product-status-${p.id}`} />
            ),
          },
        ]}
        rows={products ?? []}
        loading={isLoading}
        rowTestId={(p) => `product-row-${p.id}`}
        searchPlaceholder="Search products…"
        onRowClick={isAdmin ? (p) => setEditing(p) : undefined}
        emptyTitle="No products yet"
        emptyMessage="Products and services priced here feed quotations and invoices."
      />

      {/* Product dialog */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg" data-testid="product-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit product" : "New product"}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <Field label="Name">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="product-name-input" />
              </Field>
              <Field label="Type">
                <Select value={editing.type} onValueChange={(v: string) => setEditing({ ...editing, type: v as Product["type"] })}>
                  <SelectTrigger data-testid="product-type-select">
                    <SelectValue>{editing.type === "service" ? "Service" : "Product"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Sales price ($)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(editing.sales_price_cents / 100).toString()}
                  onChange={(e) => setEditing({ ...editing, sales_price_cents: Math.round(Number(e.target.value) * 100) || 0 })}
                  data-testid="product-sales-price-input"
                />
              </Field>
              <Field label="Cost price ($)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(editing.cost_price_cents / 100).toString()}
                  onChange={(e) => setEditing({ ...editing, cost_price_cents: Math.round(Number(e.target.value) * 100) || 0 })}
                  data-testid="product-cost-price-input"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <Input value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} data-testid="product-notes-input" />
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
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending || !editing?.name.trim()} data-testid="product-save-button">
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {variantFor ? (
        <VariantDialog product={variantFor} canEdit={isAdmin} onClose={() => setVariantFor(null)} />
      ) : null}
    </div>
  );
}

function VariantDialog({ product, canEdit, onClose }: { product: Product; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Variant | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/products/${product.id}/variants/${id}`),
    onSuccess: () => {
      toast.success("Variant removed");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: (v: Variant) => {
      const body = { name: v.name, adjustment_type: v.adjustment_type, adjustment_value: v.adjustment_value };
      return v.id
        ? apiPatch<Variant>(`/products/${product.id}/variants/${v.id}`, body)
        : apiPost<Variant>(`/products/${product.id}/variants`, body);
    },
    onSuccess: () => {
      toast.success("Variant saved");
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="variant-dialog">
        <DialogHeader>
          <DialogTitle>Variants — {product.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          {product.variants.length === 0 ? (
            <EmptyState title="No variants" message="Variants adjust the base sales price (e.g. 'With training +$150')." />
          ) : (
            product.variants.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2" data-testid={`variant-row-${v.id}`}>
                <div>
                  <p className="text-sm font-medium text-slate-900">{v.name}</p>
                  <p className="text-xs text-slate-500">
                    {v.adjustment_type === "fixed"
                      ? `${v.adjustment_value >= 0 ? "+" : "−"}${money(Math.abs(v.adjustment_value))}`
                      : `${v.adjustment_value >= 0 ? "+" : "−"}${pct(Math.abs(v.adjustment_value))}`}{" "}
                    → {money(product.sales_price_cents + (v.adjustment_type === "fixed" ? v.adjustment_value : Math.round(product.sales_price_cents * v.adjustment_value / 10000)))}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="xs" onClick={() => setEditing(v)}>
                      Edit
                    </Button>
                    <Button variant="outline" size="xs" className="text-red-600" onClick={() => remove.mutate(v.id)}>
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
          {canEdit && editing === null ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing({ id: "", product_id: product.id, name: "", adjustment_type: "fixed", adjustment_value: 0 })}
              data-testid="btn-add-variant"
            >
              Add variant
            </Button>
          ) : null}
          {editing ? (
            <div className="grid gap-3 rounded-md border border-slate-200 p-3">
              <Field label="Variant name">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="variant-name-input" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Adjustment type">
                  <Select value={editing.adjustment_type} onValueChange={(v: string) => setEditing({ ...editing, adjustment_type: v as Variant["adjustment_type"] })}>
                    <SelectTrigger data-testid="variant-adjustment-type-select">
                      <SelectValue>{editing.adjustment_type === "percentage" ? "Percentage" : "Fixed amount"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed amount</SelectItem>
                      <SelectItem value="percentage">Percentage</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label={editing.adjustment_type === "fixed" ? "Adjustment ($, can be negative)" : "Adjustment (%, can be negative)"}
                >
                  <Input
                    type="number"
                    step={editing.adjustment_type === "fixed" ? "0.01" : "0.1"}
                    value={editing.adjustment_type === "fixed" ? (editing.adjustment_value / 100).toString() : (editing.adjustment_value / 100).toString()}
                    onChange={(e) => setEditing({ ...editing, adjustment_value: Math.round(Number(e.target.value) * 100) || 0 })}
                    data-testid="variant-adjustment-value-input"
                  />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => save.mutate(editing)} disabled={save.isPending || !editing.name.trim()} data-testid="variant-save-button">
                  Save variant
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
