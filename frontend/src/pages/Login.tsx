import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import type { UserOut } from "@/lib/types";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const from = (location.state as { from?: string })?.from || "/";

  const loginMutation = useMutation({
    mutationFn: () => apiPost<UserOut>("/auth/login", { email, password }),
    onSuccess: (user) => {
      qc.setQueryData(["me"], user);
      toast.success(`Welcome back, ${user.name || user.email}!`);
      navigate(from, { replace: true });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to sign in");
    },
  });

  const handleQuickFill = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-base font-bold text-white">
            B
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-900">Brightloop</span>
        </div>

        <h1 className="mt-8 text-2xl font-bold tracking-tight text-slate-900">Sign in to your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter your credentials below to access your dashboard.
        </p>

        <form
          className="mt-8 grid gap-4"
          data-testid="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            loginMutation.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="login-email">Email address</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              data-testid="login-email-input"
              required
            />
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password">Password</Label>
              <Link
                to="/reset-password"
                className="text-xs text-slate-600 hover:text-slate-900 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              data-testid="login-password-input"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={loginMutation.isPending}
            data-testid="login-submit-button"
            className="w-full mt-2"
          >
            {loginMutation.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-8 border-t border-slate-200 pt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Quick demo accounts
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleQuickFill("admin@brightloop.io", "Bright@Loop1")}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill("staff@brightloop.io", "Staff@Loop1")}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Staff
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill("sara@novatek.io", "Customer@1")}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Customer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

