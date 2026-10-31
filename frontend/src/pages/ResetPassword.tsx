import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { validatePasswordClient } from "@/lib/validation";
import type { ForgotResponse } from "@/lib/types";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [forgotInfo, setForgotInfo] = useState<ForgotResponse | null>(null);

  const forgot = useMutation({
    mutationFn: () => apiPost<ForgotResponse>("/auth/forgot-password", { email }),
    onSuccess: (data) => {
      setForgotInfo(data);
      if (data.reset_token) setToken(data.reset_token);
    },
    onError: () => toast.error("Could not process the request"),
  });

  const reset = useMutation({
    mutationFn: () => apiPost<{ ok: boolean; message: string }>("/auth/reset-password", { token, password }),
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pwError = password ? validatePasswordClient(password) : null;

  return (
    <div className="flex min-h-svh items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-base font-bold text-white">
            B
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-900">Brightloop</span>
        </div>

        <h1 className="mt-8 text-2xl font-bold tracking-tight text-slate-900">Reset your password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Email delivery is not configured in this build. Request a reset token below — in demo
          mode the token is shown here so the flow is testable.
        </p>

        <form
          className="mt-8 grid gap-4"
          data-testid="forgot-form"
          onSubmit={(e) => {
            e.preventDefault();
            forgot.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="forgot-email">Account email</Label>
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              data-testid="forgot-email-input"
              required
            />
          </div>
          <Button type="submit" disabled={forgot.isPending} data-testid="forgot-submit-button">
            {forgot.isPending ? "Requesting…" : "Get reset token"}
          </Button>
        </form>

        {forgotInfo ? (
          <div
            className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600"
            data-testid="forgot-result"
          >
            <p className="font-medium text-slate-800">{forgotInfo.message}</p>
            {forgotInfo.reset_token ? (
              <p className="mt-2 break-all font-mono text-[11px] text-slate-500">
                Token: {forgotInfo.reset_token}
              </p>
            ) : null}
          </div>
        ) : null}

        <form
          className="mt-8 grid gap-4"
          data-testid="reset-form"
          onSubmit={(e) => {
            e.preventDefault();
            const err = validatePasswordClient(password);
            if (err) {
              toast.error(err);
              return;
            }
            reset.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="reset-token">Reset token</Label>
            <Input
              id="reset-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              data-testid="reset-token-input"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="reset-password-input"
              required
            />
            {pwError ? <p className="text-xs text-red-600">{pwError}</p> : (
              <p className="text-xs text-slate-500">
                At least 9 characters with an uppercase letter, a lowercase letter and a special
                character.
              </p>
            )}
          </div>
          <Button
            type="submit"
            disabled={reset.isPending || !token || !password}
            data-testid="reset-submit-button"
          >
            {reset.isPending ? "Updating…" : "Set new password"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-slate-500">
          <Link to="/login" className="font-medium text-slate-900 underline underline-offset-4" data-testid="back-to-login">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
