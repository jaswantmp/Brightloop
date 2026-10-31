"""Catalog models: products, variants, plans, taxes, discounts."""
from typing import Literal

from pydantic import BaseModel, Field


# --- products & variants -------------------------------------------------
class VariantIn(BaseModel):
    name: str = Field(min_length=1)
    adjustment_type: Literal["fixed", "percentage"] = "fixed"
    adjustment_value: int = 0  # cents when fixed, bps when percentage


class VariantOut(BaseModel):
    id: str
    product_id: str
    name: str
    adjustment_type: Literal["fixed", "percentage"]
    adjustment_value: int


class ProductIn(BaseModel):
    name: str = Field(min_length=1)
    type: Literal["product", "service"] = "product"
    sales_price_cents: int = 0
    cost_price_cents: int = 0
    notes: str = ""
    tax_id: str | None = None
    active: bool = True


class ProductOut(ProductIn):
    id: str
    created_at: str
    variants: list[VariantOut] = []


# --- plans ---------------------------------------------------------------
class PlanIn(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    billing_period: Literal["daily", "weekly", "monthly", "yearly"] = "monthly"
    price_cents: int = 0
    min_quantity: int = Field(default=1, ge=1)
    available_from: str | None = None
    available_to: str | None = None
    auto_close: bool = True
    allow_pause: bool = True
    allow_renewal: bool = True
    allow_early_close: bool = True
    tax_id: str | None = None
    active: bool = True


class PlanOut(PlanIn):
    id: str
    created_at: str


# --- taxes ---------------------------------------------------------------
class TaxIn(BaseModel):
    name: str = Field(min_length=1)
    rate_bps: int = Field(ge=0, le=10000)  # basis points: 8.5% = 850
    is_default: bool = False


class TaxOut(TaxIn):
    id: str


# --- discounts -----------------------------------------------------------
class DiscountIn(BaseModel):
    name: str = Field(min_length=1)
    type: Literal["fixed", "percentage"] = "percentage"
    value: int = Field(gt=0)  # cents when fixed, bps when percentage
    min_purchase_cents: int = 0
    min_quantity: int = 0
    start_date: str | None = None
    end_date: str | None = None
    usage_limit: int | None = None


class DiscountOut(DiscountIn):
    id: str
    used_count: int = 0
