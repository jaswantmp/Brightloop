import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPut } from "@/lib/api";
import { dateFmt } from "@/lib/format";
import type { AuditEntry, Settings } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/DataTable";
import { DemoBadge, Field, PageHeader } from "@/components/ui-bits";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<Settings>("/settings"),
  });
  const { data: audit } = useQuery({
    queryKey: ["audit"],
    queryFn: () => apiGet<AuditEntry[]>("/audit"),
  });

  const [form, setForm] = useState<Settings | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  const save = useMutation({
    mutationFn: (body: Settings) =>
      apiPut<Settings>("/settings", {
        company_name: body.company_name,
        currency: body.currency,
        default_payment_terms_days: body.default_payment_terms_days,
        invoice_terms: body.invoice_terms,
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-8">
      <div>
        <PageHeader
          title="Settings"
          description="Company defaults used across billing. Admin-only."
          actions={
            settings?.demo_mode ? <DemoBadge /> : null
          }
        />
        {form ? (
          <div className="max-w-xl grid gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <Field label="Company name">
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                data-testid="settings-company-input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Currency">
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  data-testid="settings-currency-input"
                />
              </Field>
              <Field label="Default payment terms (days)">
                <Input
                  type="number"
                  min="0"
                  max="365"
                  value={form.default_payment_terms_days.toString()}
                  onChange={(e) =>
                    setForm({ ...form, default_payment_terms_days: Number(e.target.value) || 0 })
                  }
                  data-testid="settings-terms-input"
                />
              </Field>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium text-slate-700">Invoice terms</Label>
              <textarea
                className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950"
                value={form.invoice_terms}
                onChange={(e) => setForm({ ...form, invoice_terms: e.target.value })}
                data-testid="settings-invoice-terms-input"
              />
            </div>
            <p className="text-xs text-slate-500">
              Demo mode is {settings?.demo_mode ? "ON" : "OFF"} — seeded records are labeled and
              safe to explore.
            </p>
            <div>
              <Button
                onClick={() => save.mutate(form)}
                disabled={save.isPending}
                data-testid="settings-save-button"
              >
                {save.isPending ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="h-64 animate-pulse rounded-lg bg-slate-50" />
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Audit history</p>
        <p className="mb-3 text-xs text-slate-500">
          Important actions (logins, lifecycle changes, billing runs, settings) are recorded
          server-side.
        </p>
        <DataTable
          columns={[
            { key: "created_at", header: "When", render: (a) => dateFmt(a.created_at.slice(0, 10)) },
            { key: "actor_email", header: "Actor", searchValue: (a) => a.actor_email ?? "" },
            { key: "action", header: "Action", searchValue: (a) => a.action },
            { key: "entity", header: "Entity" },
            { key: "details", header: "Details", searchValue: (a) => a.details },
          ]}
          rows={audit ?? []}
          rowTestId={(a) => `audit-row-${a.id}`}
          searchPlaceholder="Search audit log…"
          pageSize={12}
          emptyTitle="No audit entries yet"
        />
      </div>
    </div>
  );
}
