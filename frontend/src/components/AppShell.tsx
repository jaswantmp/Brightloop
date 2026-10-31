import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CreditCard,
  FileText,
  LayoutDashboard,
  Layers,
  Package,
  Percent,
  Receipt,
  Repeat,
  Settings,
  ShieldAlert,
  Sparkles,
  Tag,
  UserCheck,
  Users,
  Menu,
  LogOut,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { apiPost } from "@/lib/api";
import { endSession, useMe } from "@/lib/session";
import type { Role } from "@/lib/types";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";

interface NavItem {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  path: string;
  roles: Role[];
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/", roles: ["ADMIN", "STAFF", "CUSTOMER"] },
      { id: "finance", label: "Finance Reports", icon: BarChart3, path: "/reports", roles: ["ADMIN"] },
      { id: "ai", label: "AI Assistant", icon: Sparkles, path: "/assistant", roles: ["ADMIN", "STAFF", "CUSTOMER"] },
    ],
  },
  {
    title: "Subscription engine",
    items: [
      { id: "subscriptions", label: "Subscriptions", icon: Repeat, path: "/subscriptions", roles: ["ADMIN", "STAFF", "CUSTOMER"] },
      { id: "quotations", label: "Quotations", icon: FileText, path: "/quotations", roles: ["ADMIN", "STAFF", "CUSTOMER"] },
      { id: "plans", label: "Plans", icon: Layers, path: "/plans", roles: ["ADMIN", "STAFF", "CUSTOMER"] },
      { id: "products", label: "Products", icon: Package, path: "/products", roles: ["ADMIN", "STAFF"] },
    ],
  },
  {
    title: "Billing & revenue",
    items: [
      { id: "invoices", label: "Invoices", icon: Receipt, path: "/invoices", roles: ["ADMIN", "STAFF", "CUSTOMER"] },
      { id: "payments", label: "Payments", icon: CreditCard, path: "/payments", roles: ["ADMIN", "STAFF", "CUSTOMER"] },
      { id: "recovery", label: "Payment Recovery", icon: ShieldAlert, path: "/recovery", roles: ["ADMIN", "STAFF"] },
      { id: "discounts", label: "Discounts", icon: Tag, path: "/discounts", roles: ["ADMIN"] },
      { id: "taxes", label: "Taxes", icon: Percent, path: "/taxes", roles: ["ADMIN"] },
    ],
  },
  {
    title: "Directory & admin",
    items: [
      { id: "customers", label: "Customers", icon: Users, path: "/customers", roles: ["ADMIN", "STAFF"] },
      { id: "staff", label: "Staff", icon: UserCheck, path: "/staff", roles: ["ADMIN"] },
      { id: "settings", label: "Settings", icon: Settings, path: "/settings", roles: ["ADMIN"] },
    ],
  },
];

const ROLE_BADGE: Record<Role, string> = {
  ADMIN: "bg-slate-900 text-white",
  STAFF: "bg-slate-100 text-slate-700 border border-slate-200",
  CUSTOMER: "bg-slate-100 text-slate-700 border border-slate-200",
};

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-4 px-3 py-4" data-testid="sidebar-nav">
      {NAV_SECTIONS.map((section) => {
        const items = section.items.filter((i) => i.roles.includes(role));
        if (items.length === 0) return null;
        return (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {section.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {items.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  end={item.path === "/"}
                  onClick={onNavigate}
                  data-testid={`sidebar-nav-${item.id}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                      isActive
                        ? "bg-slate-100 font-medium text-slate-900"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`
                  }
                >
                  <item.icon className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 pt-5 pb-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">
        B
      </span>
      <span className="text-base font-semibold tracking-tight text-slate-900">Brightloop</span>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const role = me?.role ?? "STAFF";
  const title =
    NAV_SECTIONS.flatMap((s) => s.items).find(
      (i) => i.path === location.pathname || (i.path !== "/" && location.pathname.startsWith(i.path))
    )?.label ?? "Dashboard";

  return (
    <div className="min-h-svh bg-white">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <Brand />
        <NavLinks role={role} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="lg:hidden" data-testid="sidebar-mobile-toggle" />
          }
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Brand />
          <NavLinks role={role} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="lg:hidden">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger
                  render={
                    <Button variant="ghost" size="icon" data-testid="sidebar-mobile-toggle-top" />
                  }
                >
                  <Menu className="h-5 w-5" />
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <Brand />
                  <NavLinks role={role} onNavigate={() => setMobileOpen(false)} />
                </SheetContent>
              </Sheet>
            </span>
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h1>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE[role]}`}>
              {role}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                  data-testid="topbar-user-menu"
                />
              }
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                {(me?.name ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden text-sm text-slate-700 sm:inline">{me?.name}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="text-sm font-medium text-slate-900">{me?.name}</p>
                <p className="text-xs font-normal text-slate-500">{me?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="menu-change-password"
                onClick={() => setPwOpen(true)}
              >
                <KeyRound className="mr-2 h-4 w-4 text-slate-400" /> Change password
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="menu-logout"
                onClick={async () => {
                  await endSession(qc);
                  window.location.href = "/login";
                }}
              >
                <LogOut className="mr-2 h-4 w-4 text-slate-400" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>

      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}

export { Brand };
