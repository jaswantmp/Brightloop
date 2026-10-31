import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { money } from "@/lib/format";
import type { DashboardData, ForecastData } from "@/lib/types";
import {
  AgeingBarChart,
  ChartFrame,
  ForecastChart,
  GrowthLineChart,
  PlanRevenueBar,
  RevenueTrendChart,
  StatusDonut,
} from "@/components/charts";
import { DemoBadge, EmptyState, StatCard } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";

// ADMIN finance reports: the full analytics view. STAFF and CUSTOMER are
// blocked from this route on the backend (403) — not just in the menu.
export default function Reports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = new URLSearchParams();
  if (from) params.set("from_d", from);
  if (to) params.set("to_d", to);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: () => apiGet<DashboardData>(`/reports/dashboard?${params.toString()}`),
  });
  const { data: forecast } = useQuery({
    queryKey: ["forecast"],
    queryFn: () => apiGet<ForecastData>("/reports/forecast"),
  });

  const k = data?.kpis;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Finance reports</h2>
          {data?.is_demo ? <DemoBadge /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="reports-date-filter">
          <span className="text-xs font-medium text-slate-500">From</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40 bg-white" data-testid="reports-date-from" />
          <span className="text-xs font-medium text-slate-500">To</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40 bg-white" data-testid="reports-date-to" />
        </div>
      </div>

      {isError ? (
        <EmptyState
          title="Reports unavailable"
          message="Financial data could not be loaded. Reports will render as soon as the backend responds."
          testid="reports-error"
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="MRR" value={k ? money(k.mrr_cents) : "—"} sub="Monthly recurring revenue" testid="reports-kpi-mrr" />
        <StatCard label="ARR" value={k ? money(k.arr_cents) : "—"} sub="Annual run rate" testid="reports-kpi-arr" />
        <StatCard
          label="Collected (period)"
          value={k ? money(k.collected_cents) : "—"}
          sub={
            k?.collected_change_pct != null
              ? `${k.collected_change_pct >= 0 ? "+" : ""}${k.collected_change_pct}% vs previous period`
              : "No prior-period comparison available"
          }
          testid="reports-kpi-collected"
        />
        <StatCard
          label="Outstanding"
          value={k ? money(k.outstanding_cents) : "—"}
          sub={k ? `${money(k.overdue_cents)} overdue` : undefined}
          testid="reports-kpi-outstanding"
        />
      </div>

      <ChartFrame title="Monthly revenue" description="Collected payments across the selected period" testid="chart-revenue-monthly">
        {data ? <RevenueTrendChart data={data.revenue_trend} /> : <ChartSkeleton />}
      </ChartFrame>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame title="Revenue by plan" description="Billed revenue per plan per month (stacked)" testid="chart-revenue-by-plan">
          {data ? <PlanRevenueBar data={data.revenue_by_plan} /> : <ChartSkeleton />}
        </ChartFrame>
        <ChartFrame title="Overdue ageing" description="Outstanding balance by overdue age" testid="chart-overdue-ageing">
          {data ? <AgeingBarChart data={data.overdue_ageing} /> : <ChartSkeleton />}
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame title="Subscription growth" description="Active subscriptions over time" testid="chart-sub-growth">
          {data ? <GrowthLineChart data={data.sub_growth} /> : <ChartSkeleton />}
        </ChartFrame>
        <ChartFrame title="Invoice payment status" description="Paid / unpaid / overdue / cancelled / draft" testid="chart-invoice-status">
          {data ? <StatusDonut data={data.invoice_status} /> : <ChartSkeleton />}
        </ChartFrame>
      </div>

      <ChartFrame
        title="Revenue forecast"
        description="Actual collected revenue vs. projection"
        testid="chart-forecast-report"
      >
        {forecast ? (
          <>
            <ForecastChart data={forecast.series} />
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4" data-testid="forecast-assumptions">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Forecast assumptions
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
                {forecast.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Current run rate: MRR {money(forecast.mrr_cents)} · ARR {money(forecast.arr_cents)}
              </p>
            </div>
          </>
        ) : (
          <ChartSkeleton />
        )}
      </ChartFrame>
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-64 animate-pulse rounded-md bg-slate-50" />;
}
