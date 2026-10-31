import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { pct } from "@/lib/format";
import type { Tax } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/DataTable";
import { Field, PageHeader } from "@/components/ui-bits";

const EMPTY: Tax = { id: "", name: "", rate_bps: 0, is_default: false };

export default function Taxes() {
  const qc = useQueryClient();
  const { data: taxes, isLoading } = useQuery({
    queryKey: ["taxes"],
    queryFn: () => apiGet<Tax[]>("/taxes"),
  });
  const [editing, setEditing] = useState<Tax | null>(null);

  const save = useMutation({
    mutationFn: (t: Tax) => (t.id ? apiPatch<Tax>(`/taxes/${t.id}`, t) : apiPost<Tax>("/taxes", t)),
    onSuccess: () => {
      toast.success("Tax saved");
      qc.invalidateQueries({ queryKey: ["taxes"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/taxes/${id}`),
    onSuccess: () => {
      toast.success("Tax deleted");
      qc.invalidateQueries({ queryKey: ["taxes"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Taxes"
        description="Tax rules applied to plans, products and invoice lines. Admin-only."
        actions={
          <Button onClick={() => setEditing({ ...EMPTY })} data-testid="btn-create-tax">
            New tax rule
          </Button>
        }
      />
      <DataTable
        columns={[
          { key: "name", header: "Name", searchValue: (t) => t.name },
          { key: "rate", header: "Rate", align: "right", render: (t) => pct(t.rate_bps) },
          {
            key: "is_default",
            header: "Default",
            render: (t) => (t.is_default ? <span className="text-xs font-medium text-emerald-700">Default</span> : <span className="text-xs text-slate-400">—</span>),
          },
        ]}
        rows={taxes ?? []}
        loading={isLoading}
        rowTestId={(t) => `tax-row-${t.id}`}
        searchPlaceholder="Search taxes…"
        onRowClick={(t) => setEditing(t)}
        emptyTitle="No tax rules"
        emptyMessage="Add a tax rule to apply it to plans and products."
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md" data-testid="tax-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit tax rule" : "New tax rule"}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-4 py-2">
              <Field label="Name">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="tax-name-input" />
              </Field>
              <Field label="Rate (%)">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={(editing.rate_bps / 100).toString()}
                  onChange={(e) => setEditing({ ...editing, rate_bps: Math.round(Number(e.target.value) * 100) || 0 })}
                  data-testid="tax-rate-input"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox
                  checked={editing.is_default}
                  onCheckedChange={(checked) => setEditing({ ...editing, is_default: checked === true })}
                  data-testid="tax-default-checkbox"
                />
                Default tax for new plans and products
              </label>
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
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending || !editing?.name.trim()} data-testid="tax-save-button">
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
