import { useMe } from "@/lib/session";
import { AdminDashboard } from "@/pages/dashboards/AdminDashboard";
import { StaffDashboard } from "@/pages/dashboards/StaffDashboard";
import { CustomerDashboard } from "@/pages/dashboards/CustomerDashboard";

// After login, this renders the dashboard for the authenticated role —
// ADMIN, STAFF and CUSTOMER each get their own view and data scope.
export default function Dashboard() {
  const { data: me, isLoading } = useMe();
  if (isLoading || !me) {
    return (
      <div className="grid gap-4">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-100" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
          ))}
        </div>
      </div>
    );
  }
  if (me.role === "ADMIN") return <AdminDashboard />;
  if (me.role === "STAFF") return <StaffDashboard />;
  return <CustomerDashboard />;
}
