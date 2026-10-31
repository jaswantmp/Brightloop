// Recharts wrappers with the Brightloop restrained styling: white cards, neutral
// grid, tooltips with money formatting, legends on multi-series charts.
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, STATUS_COLORS, STATUS_LABELS, money, monthLabel } from "@/lib/format";

export function ChartFrame({
  title,
  description,
  children,
  testid,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  testid?: string;
  action?: ReactNode;
}) {
  return (
    <div
      data-testid={testid}
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold tracking-tight text-slate-900">{title}</p>
          {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

const axisStyle = { fontSize: 11, fill: "#64748B" };
const moneyTick = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);

export function RevenueTrendChart({
  data,
  testid,
}: {
  data: { month: string; collected_cents: number }[];
  testid?: string;
}) {
  const rows = data.map((d) => ({ month: monthLabel(d.month), cents: d.collected_cents / 100 }));
  return (
    <div data-testid={testid} className="h-64">
      {rows.every((r) => r.cents === 0) ? (
        <ChartEmpty />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={false} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={moneyTick} width={48} />
            <Tooltip
              formatter={(value: number) => [money(Math.round(value * 100)), "Collected"]}
              contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }}
            />
            <Bar dataKey="cents" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} maxBarSize={28} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function GrowthLineChart({
  data,
  testid,
}: {
  data: { month: string; active: number }[];
  testid?: string;
}) {
  const rows = data.map((d) => ({ month: monthLabel(d.month), active: d.active }));
  return (
    <div data-testid={testid} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="active"
            name="Active subscriptions"
            stroke={CHART_COLORS.blue}
            strokeWidth={2}
            dot={{ r: 2.5, fill: CHART_COLORS.blue }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusDonut({
  data,
  testid,
}: {
  data: { status: string; count: number; amount_cents: number }[];
  testid?: string;
}) {
  const rows = data.map((d) => ({ name: STATUS_LABELS[d.status] ?? d.status, value: d.count }));
  return (
    <div data-testid={testid} className="h-64">
      {rows.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              strokeWidth={1}
            >
              {rows.map((r) => (
                <Cell
                  key={r.name}
                  fill={
                    STATUS_COLORS[
                      Object.entries(STATUS_LABELS).find(([, l]) => l === r.name)?.[0] ?? "draft"
                    ] ?? "#94A3B8"
                  }
                />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function PlanRevenueBar({
  data,
  testid,
}: {
  data: { month: string; plan: string; revenue_cents: number }[];
  testid?: string;
}) {
  const planNames = Array.from(new Set(data.map((d) => d.plan)));
  const palette = [CHART_COLORS.primary, CHART_COLORS.blue, CHART_COLORS.emerald, CHART_COLORS.amber, CHART_COLORS.violet, CHART_COLORS.red];
  const months = Array.from(new Set(data.map((d) => d.month))).sort();
  const rows = months.map((m) => {
    const row: Record<string, string | number> = { month: monthLabel(m) };
    for (const p of planNames) {
      row[p] =
        (data.find((d) => d.month === m && d.plan === p)?.revenue_cents ?? 0) / 100;
    }
    return row;
  });
  return (
    <div data-testid={testid} className="h-64">
      {data.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={false} />
            <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={moneyTick} width={48} />
            <Tooltip
              formatter={(value: number) => money(Math.round(value * 100))}
              contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            {planNames.map((p, i) => (
              <Bar
                key={p}
                dataKey={p}
                stackId="a"
                fill={palette[i % palette.length]}
                maxBarSize={28}
                radius={i === planNames.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function AgeingBarChart({
  data,
  testid,
}: {
  data: { bucket: string; count: number; amount_cents: number }[];
  testid?: string;
}) {
  const rows = data.map((d) => ({ bucket: d.bucket, cents: d.amount_cents / 100, count: d.count }));
  return (
    <div data-testid={testid} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="bucket" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={moneyTick} width={48} />
          <Tooltip
            formatter={(value: number, _name, entry) =>
              money(Math.round(value * 100)) + ` (${(entry?.payload?.count ?? 0)} invoices)`
            }
            contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }}
          />
          <Bar dataKey="cents" name="Outstanding" fill={CHART_COLORS.red} radius={[3, 3, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ForecastChart({
  data,
  testid,
}: {
  data: { month: string; actual_cents: number | null; projected_cents: number | null }[];
  testid?: string;
}) {
  const rows = data.map((d) => ({
    month: monthLabel(d.month),
    actual: d.actual_cents != null ? d.actual_cents / 100 : null,
    projected: d.projected_cents != null ? d.projected_cents / 100 : null,
  }));
  return (
    <div data-testid={testid} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={false} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={moneyTick} width={48} />
          <Tooltip
            formatter={(value: number, name) => [money(Math.round(value * 100)), String(name)]}
            contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="actual" name="Actual collected" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
          <Line type="monotone" dataKey="projected" name="Projected (MRR)" stroke={CHART_COLORS.blue} strokeDasharray="6 4" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartEmpty() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-slate-500">
      No data for this period yet.
    </div>
  );
}
