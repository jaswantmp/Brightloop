// Session ownership: this module owns auth state and cache hygiene.
// After login/signup -> queryClient gets ["me"]; sign-out always goes through
// endSession() so the previous account's react-query cache never leaks.
import { Link, Navigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { apiGet, apiPost } from "@/lib/api";
import type { Role, UserOut } from "@/lib/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<UserOut>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

export async function endSession(qc: ReturnType<typeof useQueryClient>) {
  try {
    await apiPost("/auth/logout");
  } finally {
    qc.clear();
  }
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data: me, isLoading, isPending } = useMe();
  const location = useLocation();

  // Wait for the auth session query to settle before making access decisions
  if (isLoading || isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  // Preserve full path with query parameters so deep links restore properly after sign-in
  if (!me) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  if (!roles.includes(me.role)) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-2 bg-white px-6 text-center">
        <p className="text-lg font-semibold tracking-tight text-slate-900">Access denied</p>
        <p className="max-w-sm text-sm text-slate-500">
          Your role ({me.role.replace("_", " ").toLowerCase()}) is not permitted to open this
          area. If you believe this is an error, contact an administrator.
        </p>
        <Link to="/" className="mt-2 text-sm font-medium text-slate-900 underline underline-offset-4">
          Back to my dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
