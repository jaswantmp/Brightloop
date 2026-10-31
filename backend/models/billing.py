"""Billing models: quotations, subscriptions, invoices, payments, reminders."""
from typing import Any, Literal

from pydantic import BaseModel, Field


# --- shared line shape (quotation & invoice output) -----------------------
class LineOut(BaseModel):
    description: str
    quantity: int
    unit_price_cents: int
    discount_cents: int = 0
    tax_bps: int = 0
    tax_cents: int = 0
    line_total_cents: int


# --- quotations ----------------------------------------------------------
class QuoteLineItemIn(BaseModel):
    kind: Literal["product", "plan"]
    ref_id: str
    variant_id: str | None = None
    quantity: int = Field(default=1, ge=1)
    discount_id: str | None = None


class QuotationIn(BaseModel):
    customer_id: str
    issue_date: str | None = None  # default: today (server-side)
    valid_until: str | None = None
    lines: list[QuoteLineItemIn] = Field(min_length=1)
    notes: str = ""


class QuotationOut(BaseModel):
    id: str
    number: str
    customer_id: str
    customer_name: str | None = None
    status: Literal["draft", "sent", "accepted", "rejected", "expired"]
    issue_date: str
    valid_until: str | None = None
    lines: list[LineOut]
    subtotal_cents: int
    discount_cents: int
    tax_cents: int
    total_cents: int
    notes: str = ""
    subscription_ids: list[str] = []
    created_at: str


class TemplateIn(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    lines: list[QuoteLineItemIn] = Field(min_length=1)


class TemplateOut(BaseModel):
    id: str
    name: str
    description: str
    lines: list[QuoteLineItemIn]
    created_at: str


# --- subscriptions -------------------------------------------------------
class SubscriptionIn(BaseModel):
    customer_id: str
    plan_id: str
    quantity: int = Field(default=1, ge=1)
    start_date: str | None = None  # default: today (server-side)
    payment_terms_days: int = Field(default=30, ge=0, le=365)
    discount_id: str | None = None


class SubscriptionOut(BaseModel):
    id: str
    number: str
    customer_id: str
    customer_name: str | None = None
    plan_id: str
    plan_name: str | None = None
    status: Literal["draft", "quotation", "confirmed", "active", "closed"]
    start_date: str
    end_date: str | None = None
    billing_period: str
    quantity: int
    unit_price_cents: int
    tax_id: str | None = None
    tax_bps: int
    discount_id: str | None = None
    payment_terms_days: int
    next_billing_date: str | None = None
    paused: bool = False
    quotation_id: str | None = None
    close_reason: str | None = None
    created_at: str
    is_demo: bool = False


class ActionIn(BaseModel):
    action: Literal[
        "create_quotation", "confirm", "activate", "pause", "resume", "close", "renew"
    ]
    end_date: str | None = None


class ChangeRequestIn(BaseModel):
    subscription_id: str
    type: Literal["pause", "resume", "renew", "cancel", "quantity_change"]
    quantity_new: int | None = None
    details: str = ""


class ChangeRequestOut(BaseModel):
    id: str
    subscription_id: str
    customer_id: str
    type: str
    details: str = ""
    quantity_new: int | None = None
    status: Literal["pending", "approved", "rejected"]
    created_at: str
    decided_at: str | None = None
    decided_by: str | None = None


# --- invoices & payments -------------------------------------------------
class InvoiceLineIn(BaseModel):
    description: str = Field(min_length=1)
    quantity: int = Field(ge=1)
    unit_price_cents: int = Field(ge=0)
    tax_bps: int = Field(default=0, ge=0, le=10000)
    discount_cents: int = Field(default=0, ge=0)


class InvoiceIn(BaseModel):
    customer_id: str
    due_date: str | None = None
    lines: list[InvoiceLineIn] = Field(min_length=1)
    notes: str = ""


class InvoiceOut(BaseModel):
    id: str
    number: str
    customer_id: str
    customer_name: str | None = None
    subscription_id: str | None = None
    period_start: str | None = None
    period_end: str | None = None
    status: Literal["draft", "confirmed", "paid", "cancelled"]
    issue_date: str
    due_date: str
    lines: list[LineOut]
    subtotal_cents: int
    discount_cents: int
    tax_cents: int
    total_cents: int
    amount_paid_cents: int
    balance_cents: int
    notes: str = ""
    created_at: str
    is_demo: bool = False


class PaymentIn(BaseModel):
    invoice_id: str
    amount_cents: int = Field(gt=0)
    method: Literal["card", "bank_transfer", "ach", "cash", "other"] = "card"
    paid_at: str | None = None  # default: today (server-side)
    note: str = ""


class PaymentOut(BaseModel):
    id: str
    number: str
    invoice_id: str
    customer_id: str
    amount_cents: int
    method: str
    paid_at: str
    note: str = ""
    created_at: str


class ReminderOut(BaseModel):
    id: str
    invoice_id: str
    customer_id: str
    stage: int
    scheduled_date: str
    status: Literal["scheduled", "sent", "skipped"]
    channel: str
    note: str = ""
    sent_at: str | None = None
    created_at: str


class BillingRunOut(BaseModel):
    invoices_created: int
    subscriptions_closed: list[str] = []
    already_billed_skipped: int = 0
    overdue_invoices_tracked: int = 0
    extra: dict[str, Any] = {}
