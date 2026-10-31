import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireRole } from "@/lib/session";
import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import Products from "@/pages/Products";
import Plans from "@/pages/Plans";
import Quotations from "@/pages/Quotations";
import Subscriptions from "@/pages/Subscriptions";
import Invoices from "@/pages/Invoices";
import Payments from "@/pages/Payments";
import Taxes from "@/pages/Taxes";
import Discounts from "@/pages/Discounts";
import Recovery from "@/pages/Recovery";
import Reports from "@/pages/Reports";
import Assistant from "@/pages/Assistant";
import Staff from "@/pages/Staff";
import SettingsPage from "@/pages/Settings";

const ALL = ["ADMIN", "STAFF", "CUSTOMER"] as const;

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/"
        element={
          <RequireRole roles={[...ALL]}>
            <AppShell>
              <Dashboard />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/customers"
        element={
          <RequireRole roles={["ADMIN", "STAFF"]}>
            <AppShell>
              <Customers />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/products"
        element={
          <RequireRole roles={["ADMIN", "STAFF"]}>
            <AppShell>
              <Products />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/plans"
        element={
          <RequireRole roles={[...ALL]}>
            <AppShell>
              <Plans />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/quotations"
        element={
          <RequireRole roles={[...ALL]}>
            <AppShell>
              <Quotations />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/subscriptions"
        element={
          <RequireRole roles={[...ALL]}>
            <AppShell>
              <Subscriptions />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/invoices"
        element={
          <RequireRole roles={[...ALL]}>
            <AppShell>
              <Invoices />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/payments"
        element={
          <RequireRole roles={[...ALL]}>
            <AppShell>
              <Payments />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/taxes"
        element={
          <RequireRole roles={["ADMIN"]}>
            <AppShell>
              <Taxes />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/discounts"
        element={
          <RequireRole roles={["ADMIN"]}>
            <AppShell>
              <Discounts />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/recovery"
        element={
          <RequireRole roles={["ADMIN", "STAFF"]}>
            <AppShell>
              <Recovery />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/reports"
        element={
          <RequireRole roles={["ADMIN"]}>
            <AppShell>
              <Reports />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/assistant"
        element={
          <RequireRole roles={[...ALL]}>
            <AppShell>
              <Assistant />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/staff"
        element={
          <RequireRole roles={["ADMIN"]}>
            <AppShell>
              <Staff />
            </AppShell>
          </RequireRole>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireRole roles={["ADMIN"]}>
            <AppShell>
              <SettingsPage />
            </AppShell>
          </RequireRole>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
