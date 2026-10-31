"""System models: settings, audit, reports/AI payloads."""
from typing import Any, Literal

from pydantic import BaseModel, Field


class SettingsIn(BaseModel):
    company_name: str = "Brightloop"
    currency: str = "USD"
    default_payment_terms_days: int = Field(default=30, ge=0, le=365)
    invoice_terms: str = ""


class SettingsOut(SettingsIn):
    demo_mode: bool = False


class AuditOut(BaseModel):
    id: str
    actor_email: str | None = None
    action: str
    entity: str
    entity_id: str | None = None
    details: str = ""
    created_at: str


class AIStatusOut(BaseModel):
    configured: bool
    model: str | None = None


class AIAskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class AIAnswerOut(BaseModel):
    configured: bool
    answer: str | None = None
    error: str | None = None


# --- reports -------------------------------------------------------------
class DashboardOut(BaseModel):
    kpis: dict[str, Any]
    revenue_trend: list[dict[str, Any]]
    sub_growth: list[dict[str, Any]]
    invoice_status: list[dict[str, Any]]
    revenue_by_plan: list[dict[str, Any]]
    overdue_ageing: list[dict[str, Any]]
    forecast: list[dict[str, Any]]
    recent_invoices: list[dict[str, Any]] = []
    recovery_alerts: list[dict[str, Any]] = []
    is_demo: bool = True


class OpsOut(BaseModel):
    kpis: dict[str, Any]
    upcoming_billing: list[dict[str, Any]]
    overdue_followups: list[dict[str, Any]]
    recent_customers: list[dict[str, Any]]


class PortalOut(BaseModel):
    kpis: dict[str, Any]
    active_subscriptions: list[dict[str, Any]]
    open_invoices: list[dict[str, Any]]
    recent_payments: list[dict[str, Any]]


class ForecastOut(BaseModel):
    mrr_cents: int
    arr_cents: int
    series: list[dict[str, Any]]
    assumptions: list[str]
