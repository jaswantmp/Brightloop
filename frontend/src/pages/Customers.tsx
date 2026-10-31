import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { dateFmt } from "@/lib/format";
import type { Customer } from "@/lib/types";
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
import { DataTable } from "@/components/DataTable";
import { EmptyState, Field, PageHeader, StatusBadge } from "@/components/ui-bits";
import { isEmail } from "@/lib/validation";

const EMPTY: Customer = {
  id: "",
  name: "",
  company: "",
  email: "",
  phone: "",
  billing_address: "",
  notes: "",
  status: "active",
  created_at: "",
};

export default function Customers() {
  const qc = useQueryClient();
  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiGet<Customer[]>("/customers"),
  });
  const [editing, setEditing] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (c: Customer) =>
      c.id
        ? apiPatch<Customer>(`/customers/${c.id}`, c)
        : apiPost<Customer>("/customers", c),
    onSuccess: (c) => {
      toast.success(c.id ? "Customer updated" : "Customer created");
      qc.invalidateQueries({ queryKey: ["customers"] });
      setEditing(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => apiDelete(`/customers/${id}`),
    onSuccess: () => {
      toast.success("Customer archived");
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit() {
    if (!editing) return;
    if (!editing.name.trim()) return setError("Name is required");
    if (!isEmail(editing.email)) return setError("A valid email is required");
    setError(null);
    save.mutate(editing);
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Companies and contacts you bill. Customer portal users see only their own records."
        actions={
          <Button onClick={() => setEditing({ ...EMPTY })} data-testid="btn-create-customer">
            New customer
          </Button>
        }
      />
      <DataTable
        columns={[
          { key: "name", header: "Contact", searchValue: (c) => c.name },
          { key: "company", header: "Company", searchValue: (c) => c.company },
          { key: "email", header: "Email", render: (c) => <span className="font-mono text-xs">{c.email}</span>, searchValue: (c) => c.email },
          { key: "phone", header: "Phone", searchValue: (c) => c.phone },
          {
            key: "status",
            header: "Status",
            render: (c) => (
              <StatusBadge
                label={c.status}
                tone={c.status === "active" ? "emerald" : "slate"}
                testid={`customer-status-${c.id}`}
              />
            ),
          },
          { key: "created_at", header: "Added", render: (c) => dateFmt(c.created_at) },
        ]}
        rows={customers ?? []}
        loading={isLoading}
        rowTestId={(c) => `customer-row-${c.id}`}
        searchPlaceholder="Search customers…"
        onRowClick={(c) => setEditing(c)}
        emptyTitle="No customers yet"
        emptyMessage="Add your first customer to start billing."
        emptyAction={
          <Button variant="outline" size="sm" onClick={() => setEditing({ ...EMPTY })}>
            New customer
          </Button>
        }
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg" data-testid="customer-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit customer" : "New customer"}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <Field label="Contact name" error={error}>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  data-testid="customer-name-input"
                />
              </Field>
              <Field label="Company">
                <Input
                  value={editing.company}
                  onChange={(e) => setEditing({ ...editing, company: e.target.value })}
                  data-testid="customer-company-input"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  data-testid="customer-email-input"
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={editing.phone}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  data-testid="customer-phone-input"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Billing address">
                  <Input
                    value={editing.billing_address}
                    onChange={(e) => setEditing({ ...editing, billing_address: e.target.value })}
                    data-testid="customer-address-input"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Label className="mb-1.5 block text-xs font-medium text-slate-700">Notes</Label>
                <textarea
                  className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  data-testid="customer-notes-input"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            {editing?.id ? (
              <Button
                variant="outline"
                className="mr-auto text-red-600"
                onClick={() => archive.mutate(editing.id)}
                data-testid="customer-archive-button"
              >
                Archive
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending} data-testid="customer-save-button">
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
