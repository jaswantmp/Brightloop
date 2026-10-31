import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { money, dateFmt } from "@/lib/format";
import type { OpsData } from "@/lib/types";
import { DataTable } from "@/components/DataTable";
import { EmptyState, StatCard } from "@/components/ui-bits";

// STAFF view: operational dashboard — recent customers, upcoming billing,
// overdue follow-ups. No admin-only finance analytics (backend-enforced).
export function StaffDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["ops-dashboard"],
    queryFn: () => apiGet<OpsData>("/reports/ops"),
  });

  const k = data?.kpis ?? {};

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Operations today</h2>
        <p className="mt-1 text-sm text-slate-500">
          Day-to-day billing work: upcoming invoices, overdue follow-ups and new customers.
        </p>
      </div>

      {isError ? (
        <EmptyState
          title="Operations data unavailable"
          message="The backend could not be reached. Your operational data will appear as soon as it responds."
          testid="staff-dashboard-error"
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active subscriptions" value={isLoading ? "—" : String(k.active_subs ?? 0)} testid="staff-kpi-active-subs" />
        <StatCard
          label="Collected this month"
          value={isLoading ? "—" : money(Number(k.collected_this_month_cents ?? 0))}
          testid="staff-kpi-collected"
        />
        <StatCard
          label="Overdue"
          value={isLoading ? "—" : money(Number(k.overdue_cents ?? 0))}
          sub={`${k.overdue_count ?? 0} invoices need follow-up`}
          tone={Number(k.overdue_count ?? 0) > 0 ? "warning" : "default"}
          testid="staff-kpi-overdue"
        />
        <StatCard
          label="Quotations awaiting reply"
          value={isLoading ? "—" : String(k.quotations_awaiting ?? 0)}
          testid="staff-kpi-quotations"
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Upcoming billing (next 30 days)</p>
        <DataTable
          columns={[
            { key: "number", header: "Subscription", render: (r) => <span className="font-mono text-xs">{r.number}</span>, searchValue: (r) => r.number },
            { key: "customer_name", header: "Customer", searchValue: (r) => r.customer_name ?? "" },
            { key: "plan_name", header: "Plan", searchValue: (r) => r.plan_name ?? "" },
            { key: "next_billing_date", header: "Bills on", render: (r) => dateFmt(r.next_billing_date) },
            { key: "amount_cents", header: "Amount", align: "right", render: (r) => money(r.amount_cents) },
          ]}
          rows={data?.upcoming_billing ?? []}
          loading={isLoading}
          searchPlaceholder="Search upcoming…"
          emptyTitle="Nothing billing in the next 30 days"
          emptyMessage="Upcoming recurring invoices will appear here."
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Overdue follow-ups</p>
        <DataTable
          columns={[
            { key: "invoice_number", header: "Invoice", render: (r) => <span className="font-mono text-xs">{r.invoice_number}</span>, searchValue: (r) => r.invoice_number },
            { key: "customer_name", header: "Customer", searchValue: (r) => r.customer_name ?? "" },
            { key: "due_date", header: "Was due", render: (r) => dateFmt(r.due_date) },
            { key: "days_overdue", header: "Days overdue", align: "right", render: (r) => <span className="font-mono text-red-600">{r.days_overdue}</span> },
            { key: "balance_cents", header: "Balance", align: "right", render: (r) => money(r.balance_cents) },
          ]}
          rows={data?.overdue_followups ?? []}
          loading={isLoading}
          searchPlaceholder="Search overdue…"
          emptyTitle="No overdue invoices"
          emptyMessage="Nothing is past due — follow-ups stay empty until then."
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">Recent customers</p>
        <DataTable
          columns={[
            { key: "name", header: "Contact", searchValue: (r) => r.name },
            { key: "company", header: "Company", searchValue: (r) => r.company },
            { key: "created_at", header: "Added", render: (r) => dateFmt(r.created_at) },
          ]}
          rows={data?.recent_customers ?? []}
          loading={isLoading}
          searchPlaceholder="Search customers…"
          emptyTitle="No customers yet"
        />
      </div>
    </div>
  );
}
