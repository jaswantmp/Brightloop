import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { INVOICE_STATUS, money, dateFmt } from "@/lib/format";
import type { DashboardData } from "@/lib/types";
import { AgeingBarChart, ChartFrame, ForecastChart, GrowthLineChart, RevenueTrendChart, StatusDonut } from "@/components/charts";
import { DataTable } from "@/components/DataTable";
import { DemoBadge, EmptyState, StatCard, StatusBadge } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";

export function AdminDashboard() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = new URLSearchParams();
  if (from) params.set("from_d", from);
  if (to) params.set("to_d", to);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-dashboard", from, to],
    queryFn: () => apiGet<DashboardData>(`/reports/dashboard?${params.toString()}`),
  });

  const k = data?.kpis;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Finance overview</h2>
          {data?.is_demo ? <DemoBadge /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="date-range-filter">
          <span className="text-xs font-medium text-slate-500">From</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-40 bg-white"
            data-testid="date-from-input"
          />
          <span className="text-xs font-medium text-slate-500">To</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-40 bg-white"
            data-testid="date-to-input"
          />
        </div>
      </div>

      {isError ? (
        <EmptyState
          title="Analytics unavailable"
          message="Live financial data could not be loaded. The dashboard will pick it up as soon as the backend responds."
          testid="dashboard-error"
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="MRR"
          value={k ? money(k.mrr_cents) : "—"}
          sub="Monthly recurring revenue, active plans"
          testid="kpi-mrr"
        />
        <StatCard
          label="ARR"
          value={k ? money(k.arr_cents) : "—"}
          sub="MRR x 12 (annual run rate)"
          testid="kpi-arr"
        />
        <StatCard
          label="Active subscriptions"
          value={k ? String(k.active_subs) : "—"}
          sub={
            k
              ? `${k.upcoming_30d_count} billing${k.upcoming_30d_count === 1 ? "" : "s"} in the next 30 days`
              : undefined
          }
          testid="kpi-active-subs"
        />
        <StatCard
          label="Outstanding / overdue"
          value={k ? money(k.outstanding_cents) : "—"}
          sub={k ? `${money(k.overdue_cents)} overdue across ${k.overdue_count} invoices` : undefined}
          tone={k && k.overdue_count > 0 ? "warning" : "default"}
          testid="kpi-overdue"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartFrame
            title="Revenue trend"
            description="Collected payments per month (actual records)"
            testid="chart-revenue-trend"
          >
            {data ? <RevenueTrendChart data={data.revenue_trend} /> : <ChartSkeleton />}
          </ChartFrame>
        </div>
        <ChartFrame
          title="Invoice payment status"
          description="Current invoice states incl. overdue split"
          testid="chart-invoice-donut"
        >
          {data ? <StatusDonut data={data.invoice_status} /> : <ChartSkeleton />}
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Subscription growth"
          description="Active subscriptions at each month boundary"
          testid="chart-sub-growth"
        >
          {data ? <GrowthLineChart data={data.sub_growth} /> : <ChartSkeleton />}
        </ChartFrame>
        <ChartFrame
          title="Revenue forecast"
          description="Actual collected vs. projected (MRR held flat)"
          testid="chart-forecast"
        >
          {data ? <ForecastChart data={data.forecast} /> : <ChartSkeleton />}
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Recent invoices awaiting payment</p>
          <DataTable
            columns={[
              { key: "number", header: "Invoice", render: (r) => <span className="font-mono text-xs">{r.number}</span>, searchValue: (r) => r.number },
              { key: "customer_name", header: "Customer", searchValue: (r) => r.customer_name ?? "" },
              {
                key: "status",
                header: "Status",
                render: (r) => {
                  const conf = INVOICE_STATUS[r.status] ?? { label: r.status, tone: "slate" as const };
                  return <StatusBadge label={conf.label} tone={conf.tone} testid={`invoice-status-${r.id}`} />;
                },
              },
              { key: "total_cents", header: "Total", align: "right", render: (r) => money(r.total_cents) },
              { key: "due_date", header: "Due", align: "right", render: (r) => dateFmt(r.due_date) },
            ]}
            rows={data?.recent_invoices ?? []}
            loading={isLoading}
            pageSize={5}
            searchPlaceholder="Search invoices…"
            emptyTitle="No invoices yet"
            emptyMessage="Invoices appear here as subscriptions are billed."
          />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">
            Payment recovery alerts{" "}
            <Link to="/recovery" className="ml-1 text-xs font-medium text-slate-500 underline underline-offset-4">
              open recovery
            </Link>
          </p>
          <DataTable
            columns={[
              { key: "invoice_number", header: "Invoice", render: (r) => <span className="font-mono text-xs">{r.invoice_number}</span>, searchValue: (r) => r.invoice_number },
              { key: "customer_name", header: "Customer", searchValue: (r) => r.customer_name ?? "" },
              { key: "balance_cents", header: "Balance", align: "right", render: (r) => money(r.balance_cents) },
              {
                key: "days_overdue",
                header: "Overdue",
                align: "right",
                render: (r) => <span className="font-mono text-xs text-red-600">{r.days_overdue}d</span>,
              },
            ]}
            rows={data?.recovery_alerts ?? []}
            loading={isLoading}
            pageSize={5}
            searchPlaceholder="Search alerts…"
            emptyTitle="No overdue invoices"
            emptyMessage="Collections are on track — nothing needs recovery right now."
          />
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-64 animate-pulse rounded-md bg-slate-50" />;
}
