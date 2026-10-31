// Hand-written mirrors of the Pydantic models in backend/models/* — keep in sync
// in the same edit whenever a backend model changes (nothing infers across the boundary).

export type Role = "ADMIN" | "STAFF" | "CUSTOMER";

export interface UserOut {
  id: string;
  email: string;
  name: string;
  role: Role;
  customer_id: string | null;
  status: string;
  created_at?: string;
}

export interface Customer {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  billing_address: string;
  notes: string;
  status: string;
  created_at: string;
}

export interface Variant {
  id: string;
  product_id: string;
  name: string;
  adjustment_type: "fixed" | "percentage";
  adjustment_value: number;
}

export interface Product {
  id: string;
  name: string;
  type: "product" | "service";
  sales_price_cents: number;
  cost_price_cents: number;
  notes: string;
  tax_id: string | null;
  active: boolean;
  created_at: string;
  variants: Variant[];
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  billing_period: "daily" | "weekly" | "monthly" | "yearly";
  price_cents: number;
  min_quantity: number;
  available_from: string | null;
  available_to: string | null;
  auto_close: boolean;
  allow_pause: boolean;
  allow_renewal: boolean;
  allow_early_close: boolean;
  tax_id: string | null;
  active: boolean;
  created_at: string;
}

export interface Tax {
  id: string;
  name: string;
  rate_bps: number;
  is_default: boolean;
}

export interface Discount {
  id: string;
  name: string;
  type: "fixed" | "percentage";
  value: number;
  min_purchase_cents: number;
  min_quantity: number;
  start_date: string | null;
  end_date: string | null;
  usage_limit: number | null;
  used_count: number;
}

export interface Line {
  description: string;
  quantity: number;
  unit_price_cents: number;
  discount_cents: number;
  tax_bps: number;
  tax_cents: number;
  line_total_cents: number;
}

export interface QuoteLineItemIn {
  kind: "product" | "plan";
  ref_id: string;
  variant_id: string | null;
  quantity: number;
  discount_id: string | null;
}

export interface Quotation {
  id: string;
  number: string;
  customer_id: string;
  customer_name: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  issue_date: string;
  valid_until: string | null;
  lines: Line[];
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string;
  subscription_ids: string[];
  created_at: string;
}

export interface QuotationTemplate {
  id: string;
  name: string;
  description: string;
  lines: QuoteLineItemIn[];
  created_at: string;
}

export interface Subscription {
  id: string;
  number: string;
  customer_id: string;
  customer_name: string | null;
  plan_id: string;
  plan_name: string | null;
  status: "draft" | "quotation" | "confirmed" | "active" | "closed";
  start_date: string;
  end_date: string | null;
  billing_period: string;
  quantity: number;
  unit_price_cents: number;
  tax_id: string | null;
  tax_bps: number;
  discount_id: string | null;
  payment_terms_days: number;
  next_billing_date: string | null;
  paused: boolean;
  quotation_id: string | null;
  close_reason: string | null;
  created_at: string;
  is_demo: boolean;
}

export interface ChangeRequest {
  id: string;
  subscription_id: string;
  customer_id: string;
  type: string;
  details: string;
  quantity_new: number | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  subscription_number?: string | null;
  customer_name?: string | null;
}

export interface Invoice {
  id: string;
  number: string;
  customer_id: string;
  customer_name: string | null;
  subscription_id: string | null;
  period_start: string | null;
  period_end: string | null;
  status: "draft" | "confirmed" | "paid" | "cancelled";
  issue_date: string;
  due_date: string;
  lines: Line[];
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  balance_cents: number;
  notes: string;
  created_at: string;
  is_demo: boolean;
}

export interface Payment {
  id: string;
  number: string;
  invoice_id: string;
  customer_id: string;
  amount_cents: number;
  method: string;
  paid_at: string;
  note: string;
  created_at: string;
  invoice_number?: string | null;
  customer_name?: string | null;
}

export interface Reminder {
  id: string;
  invoice_id: string;
  customer_id: string;
  stage: number;
  scheduled_date: string;
  status: "scheduled" | "sent" | "skipped";
  channel: string;
  note: string;
  sent_at: string | null;
  invoice_number?: string | null;
  customer_name?: string | null;
  stage_label?: string;
  balance_cents?: number;
}

export interface RecoveryRow {
  invoice_id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string | null;
  due_date: string;
  balance_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  days_overdue: number;
  bucket: string;
  reminders_sent: number;
  reminders_scheduled: number;
}

export interface KPIs {
  mrr_cents: number;
  arr_cents: number;
  active_subs: number;
  collected_cents: number;
  collected_change_pct: number | null;
  outstanding_cents: number;
  overdue_cents: number;
  overdue_count: number;
  upcoming_30d_cents: number;
  upcoming_30d_count: number;
}

export interface RecentInvoiceRow {
  id: string;
  number: string;
  customer_name: string | null;
  status: string;
  total_cents: number;
  balance_cents: number;
  due_date: string;
}

export interface RecoveryAlertRow {
  invoice_id: string;
  invoice_number: string;
  customer_name: string | null;
  balance_cents: number;
  days_overdue: number;
}

export interface DashboardData {
  kpis: KPIs;
  revenue_trend: { month: string; collected_cents: number }[];
  sub_growth: { month: string; active: number }[];
  invoice_status: { status: string; count: number; amount_cents: number }[];
  revenue_by_plan: { month: string; plan: string; revenue_cents: number }[];
  overdue_ageing: { bucket: string; count: number; amount_cents: number }[];
  forecast: { month: string; actual_cents: number | null; projected_cents: number | null }[];
  recent_invoices: RecentInvoiceRow[];
  recovery_alerts: RecoveryAlertRow[];
  is_demo: boolean;
}

export interface OpsData {
  kpis: Record<string, number>;
  upcoming_billing: {
    id: string;
    number: string;
    customer_name: string | null;
    plan_name: string | null;
    next_billing_date: string;
    amount_cents: number;
    billing_period: string;
  }[];
  overdue_followups: {
    invoice_id: string;
    invoice_number: string;
    customer_name: string | null;
    balance_cents: number;
    due_date: string;
    days_overdue: number;
  }[];
  recent_customers: { id: string; name: string; company: string; created_at: string }[];
}

export interface PortalData {
  kpis: {
    active_subs: number;
    outstanding_cents: number;
    overdue_count: number;
    paid_last_12m_cents: number;
    next_due_date: string | null;
  };
  active_subscriptions: {
    id: string;
    number: string;
    plan_name: string | null;
    status: string;
    paused: boolean;
    billing_period: string;
    quantity: number;
    unit_price_cents: number;
    next_billing_date: string | null;
    end_date: string | null;
  }[];
  open_invoices: {
    id: string;
    number: string;
    status: string;
    total_cents: number;
    balance_cents: number;
    due_date: string;
    issue_date: string;
  }[];
  recent_payments: {
    id: string;
    number: string;
    amount_cents: number;
    paid_at: string;
    method: string;
    invoice_id: string;
  }[];
}

export interface ForecastData {
  mrr_cents: number;
  arr_cents: number;
  series: { month: string; actual_cents: number | null; projected_cents: number | null }[];
  assumptions: string[];
}

export interface Settings {
  company_name: string;
  currency: string;
  default_payment_terms_days: number;
  invoice_terms: string;
  demo_mode: boolean;
}

export interface AuditEntry {
  id: string;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: string;
  created_at: string;
}

export interface BillingRun {
  invoices_created: number;
  subscriptions_closed: string[];
  already_billed_skipped: number;
  overdue_invoices_tracked: number;
  extra: Record<string, unknown>;
}

export interface AIStatus {
  configured: boolean;
  model: string | null;
}

export interface AIAnswer {
  configured: boolean;
  answer: string | null;
  error: string | null;
}

export interface ForgotResponse {
  email_configured: boolean;
  sent: boolean;
  message: string;
  reset_token: string | null;
}
