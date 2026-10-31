import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { dateFmt } from "@/lib/format";
import type { Customer, UserOut } from "@/lib/types";
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
import { validatePasswordClient } from "@/lib/validation";

// Staff management — ADMIN only. Creating CUSTOMER portal users requires
// linking them to a customer record; permissions are enforced server-side.
export default function Staff() {
  const qc = useQueryClient();
  const { data: users, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiGet<UserOut[]>("/users"),
  });
  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiGet<Customer[]>("/customers"),
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserOut | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<UserOut>("/users", body),
    onSuccess: (u) => {
      toast.success(`Account created for ${u.email}`);
      qc.invalidateQueries({ queryKey: ["users"] });
      setCreating(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiPatch<UserOut>(`/users/${id}`, body),
    onSuccess: () => {
      toast.success("Account updated");
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Staff & accounts"
        description="Create staff and customer-portal accounts. Only admins can manage accounts."
        actions={
          <Button onClick={() => setCreating(true)} data-testid="btn-create-user">
            New account
          </Button>
        }
      />
      <DataTable
        columns={[
          { key: "name", header: "Name", searchValue: (u) => u.name },
          { key: "email", header: "Email", render: (u) => <span className="font-mono text-xs">{u.email}</span>, searchValue: (u) => u.email },
          { key: "role", header: "Role" },
          {
            key: "status",
            header: "Status",
            render: (u) => (
              <StatusBadge label={u.status === "active" ? "Active" : "Disabled"} tone={u.status === "active" ? "emerald" : "slate"} testid={`user-status-${u.id}`} />
            ),
          },
          { key: "created", header: "Created", render: (u) => dateFmt(u.created_at ?? null) },
        ]}
        rows={users ?? []}
        loading={isLoading}
        rowTestId={(u) => `user-row-${u.id}`}
        searchPlaceholder="Search accounts…"
        onRowClick={(u) => setEditing(u)}
        emptyTitle="No accounts"
      />

      <CreateDialog
        open={creating}
        customers={customers ?? []}
        onClose={() => setCreating(false)}
        onSubmit={(body) => create.mutate(body)}
        busy={create.isPending}
      />
      {editing ? (
        <EditDialog
          user={editing}
          customers={customers ?? []}
          onClose={() => setEditing(null)}
          onSubmit={(body) => update.mutate({ id: editing.id, body })}
          busy={update.isPending}
        />
      ) : null}
    </div>
  );
}

function CreateDialog({
  open,
  customers,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean;
  customers: Customer[];
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("STAFF");
  const [password, setPassword] = useState("");
  const [customerId, setCustomerId] = useState("none");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const pwError = validatePasswordClient(password);
    if (pwError) return setError(pwError);
    if (!email.trim() || !name.trim()) return setError("Name and email are required");
    if (role === "CUSTOMER" && customerId === "none") return setError("Link the account to a customer record");
    setError(null);
    onSubmit({
      email,
      name,
      role,
      password,
      customer_id: role === "CUSTOMER" ? customerId : null,
    });
    setEmail("");
    setName("");
    setPassword("");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="user-create-dialog">
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Email" error={error}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="user-email-input" />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="user-name-input" />
          </Field>
          <Field label="Role">
            <Select value={role} onValueChange={(v: string) => setRole(v)}>
              <SelectTrigger data-testid="user-role-select">
                <SelectValue>{role}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">ADMIN</SelectItem>
                <SelectItem value="STAFF">STAFF</SelectItem>
                <SelectItem value="CUSTOMER">CUSTOMER (portal)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {role === "CUSTOMER" ? (
            <Field label="Linked customer">
              <Select value={customerId} onValueChange={(v: string) => setCustomerId(v)}>
                <SelectTrigger data-testid="user-customer-select">
                  <SelectValue>{customers.find((c) => c.id === customerId)?.name ?? "Select customer"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Select customer
                  </SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field
            label="Initial password"
            hint="Min 9 characters with uppercase, lowercase and a special character."
          >
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="user-password-input" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} data-testid="user-save-button">
            {busy ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  user,
  customers,
  onClose,
  onSubmit,
  busy,
}: {
  user: UserOut;
  customers: Customer[];
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [customerId, setCustomerId] = useState(user.customer_id ?? "none");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (password) {
      const pwError = validatePasswordClient(password);
      if (pwError) return setError(pwError);
    }
    setError(null);
    onSubmit({
      role,
      status,
      customer_id: role === "CUSTOMER" ? customerId : null,
      ...(password ? { password } : {}),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="user-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit account — {user.email}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Role">
            <Select value={role} onValueChange={(v: string) => setRole(v as UserOut["role"])}>
              <SelectTrigger data-testid="user-edit-role-select">
                <SelectValue>{role}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">ADMIN</SelectItem>
                <SelectItem value="STAFF">STAFF</SelectItem>
                <SelectItem value="CUSTOMER">CUSTOMER (portal)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {role === "CUSTOMER" ? (
            <Field label="Linked customer">
              <Select value={customerId} onValueChange={(v: string) => setCustomerId(v)}>
                <SelectTrigger data-testid="user-edit-customer-select">
                  <SelectValue>{customers.find((c) => c.id === customerId)?.name ?? "Select customer"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Select customer
                  </SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field label="Status">
            <Select value={status} onValueChange={(v: string) => setStatus(v)}>
              <SelectTrigger data-testid="user-edit-status-select">
                <SelectValue>{status}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reset password" hint="Leave blank to keep the current password.">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="user-edit-password-input" />
          </Field>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} data-testid="user-edit-save-button">
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
