"""Quotations, reusable templates, and quotation→subscription conversion."""
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import any_role, audit, customer_filter, load_scoped, staff_required
from lib.billing import new_subscription_doc
from lib.db import db
from lib.money import discount_cents, tax_cents
from lib.dates import today_iso
from lib.numbering import next_number
from models.billing import (
    QuoteLineItemIn,
    QuotationIn,
    QuotationOut,
    TemplateIn,
    TemplateOut,
)

router = APIRouter(prefix="/quotations", tags=["quotations"])
templates_router = APIRouter(prefix="/quotation-templates", tags=["quotation-templates"])


async def _default_tax_bps() -> int:
    tax = await db.taxes.find_one({"is_default": True})
    return tax["rate_bps"] if tax else 0


async def compute_lines(items: list[QuoteLineItemIn]) -> tuple[list[dict], int, int, int]:
    """Server-side pricing: unit price, variant adjustment, tax and discounts are
    all resolved from stored records — the client never sends money values."""
    default_bps = await _default_tax_bps()
    lines: list[dict[str, Any]] = []
    subtotal = discount_total = tax_total = 0
    for item in items:
        if item.kind == "plan":
            doc = await db.plans.find_one({"id": item.ref_id})
            if not doc:
                raise HTTPException(status_code=404, detail="Plan not found")
            unit = doc["price_cents"]
            name = doc["name"]
            tax_id = doc.get("tax_id")
        else:
            doc = await db.products.find_one({"id": item.ref_id})
            if not doc:
                raise HTTPException(status_code=404, detail="Product not found")
            unit = doc["sales_price_cents"]
            name = doc["name"]
            tax_id = doc.get("tax_id")
            if item.variant_id:
                variant = await db.product_variants.find_one({"id": item.variant_id})
                if variant:
                    if variant["adjustment_type"] == "fixed":
                        unit = max(0, unit + variant["adjustment_value"])
                    else:
                        unit = max(0, unit + round(unit * variant["adjustment_value"] / 10000))
                    name = f"{name} — {variant['name']}"
        if tax_id:
            tax = await db.taxes.find_one({"id": tax_id})
            tax_bps = tax["rate_bps"] if tax else default_bps
        else:
            tax_bps = default_bps
        line_subtotal = item.quantity * unit
        disc = 0
        if item.discount_id:
            d = await db.discounts.find_one({"id": item.discount_id})
            if d:
                disc = discount_cents(line_subtotal, d["type"], d["value"])
        taxable = line_subtotal - disc
        tax = tax_cents(taxable, tax_bps)
        lines.append(
            {
                "description": name,
                "quantity": item.quantity,
                "unit_price_cents": unit,
                "discount_cents": disc,
                "tax_bps": tax_bps,
                "tax_cents": tax,
                "line_total_cents": taxable + tax,
            }
        )
        subtotal += line_subtotal
        discount_total += disc
        tax_total += tax
    return lines, subtotal, discount_total, tax_total


def _out(doc: dict[str, Any], customer_name: str | None = None) -> dict[str, Any]:
    payload = {k: doc.get(k) for k in QuotationOut.model_fields}
    payload["customer_name"] = customer_name
    return payload


async def _customer_names(ids: set[str]) -> dict[str, str]:
    if not ids:
        return {}
    docs = await db.customers.find({"id": {"$in": list(ids)}}).to_list(1000)
    return {d["id"]: d["name"] for d in docs}


@router.get("", response_model=list[QuotationOut])
async def list_quotations(status: str = "", q: str = "", principal=Depends(any_role)):
    query = customer_filter(principal)
    if status:
        query["status"] = status
    if q:
        query["number"] = {"$regex": q, "$options": "i"}
    docs = await db.quotations.find(query).sort([("created_at", -1)]).to_list(1000)
    names = await _customer_names({d["customer_id"] for d in docs})
    return [_out(d, names.get(d["customer_id"])) for d in docs]


@router.get("/{quotation_id}", response_model=QuotationOut)
async def get_quotation(quotation_id: str, principal=Depends(any_role)):
    doc = await load_scoped(principal, "quotations", quotation_id)
    customer = await db.customers.find_one({"id": doc["customer_id"]})
    return _out(doc, customer["name"] if customer else None)


@router.post("", response_model=QuotationOut, status_code=201)
async def create_quotation(body: QuotationIn, principal=Depends(staff_required)):
    if not await db.customers.find_one({"id": body.customer_id}):
        raise HTTPException(status_code=404, detail="Customer not found")
    lines, subtotal, discount_total, tax_total = await compute_lines(body.lines)
    doc = {
        "id": str(uuid.uuid4()),
        "number": await next_number("QT-"),
        "customer_id": body.customer_id,
        "status": "draft",
        "issue_date": body.issue_date or today_iso(),
        "valid_until": body.valid_until,
        "lines": lines,
        "source_lines": [item.model_dump() for item in body.lines],
        "subtotal_cents": subtotal,
        "discount_cents": discount_total,
        "tax_cents": tax_total,
        "total_cents": subtotal - discount_total + tax_total,
        "notes": body.notes,
        "subscription_ids": [],
        "created_by": principal.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_demo": False,
    }
    await db.quotations.insert_one(doc)
    await audit(principal, "quotation.created", "quotation", doc["id"], doc["number"])
    return _out(doc)


class StatusIn(BaseModel):
    status: str


@router.post("/{quotation_id}/status", response_model=QuotationOut)
async def set_status(quotation_id: str, body: StatusIn, principal=Depends(staff_required)):
    doc = await load_scoped(principal, "quotations", quotation_id)
    flow: dict[str, list[str]] = {"draft": ["sent"], "sent": ["accepted", "rejected"]}
    if body.status not in flow.get(doc["status"], []):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move quotation from {doc['status']} to {body.status}",
        )
    updates: dict[str, Any] = {"status": body.status}
    if body.status == "accepted" and not doc.get("subscription_ids"):
        # Accepting a quotation provisions one subscription per plan line.
        # The stored subscription_ids guard makes double-conversion impossible.
        settings = await db.settings.find_one({"id": "app"}) or {}
        created: list[str] = []
        for src in doc.get("source_lines", []):
            if src.get("kind") != "plan":
                continue
            plan = await db.plans.find_one({"id": src["ref_id"]})
            if not plan:
                continue
            sub = await new_subscription_doc(
                customer_id=doc["customer_id"],
                plan=plan,
                quantity=src.get("quantity", 1),
                start_date=today_iso(),
                payment_terms_days=settings.get("default_payment_terms_days", 30),
                discount_id=src.get("discount_id"),
                created_by=principal.user_id,
                quotation_id=doc["id"],
                status="confirmed",
                is_demo=False,
            )
            await db.subscriptions.insert_one(sub)
            created.append(sub["id"])
        if created:
            updates["subscription_ids"] = created
    await db.quotations.update_one({"id": quotation_id}, {"$set": updates})
    await audit(principal, f"quotation.{body.status}", "quotation", quotation_id)
    doc = await db.quotations.find_one({"id": quotation_id})
    customer = await db.customers.find_one({"id": doc["customer_id"]})
    return _out(doc, customer["name"] if customer else None)


# --- reusable templates ---------------------------------------------------
def _template_out(doc: dict[str, Any]) -> dict[str, Any]:
    return {k: doc.get(k) for k in TemplateOut.model_fields}


@templates_router.get("", response_model=list[TemplateOut])
async def list_templates(_principal=Depends(staff_required)):
    docs = await db.quotation_templates.find().sort([("created_at", -1)]).to_list(500)
    return [_template_out(d) for d in docs]


@templates_router.post("", response_model=TemplateOut, status_code=201)
async def create_template(body: TemplateIn, principal=Depends(staff_required)):
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.quotation_templates.insert_one(doc)
    await audit(principal, "template.created", "quotation_template", doc["id"], doc["name"])
    return _template_out(doc)


@templates_router.delete("/{template_id}")
async def delete_template(template_id: str, principal=Depends(staff_required)):
    await db.quotation_templates.delete_one({"id": template_id})
    await audit(principal, "template.deleted", "quotation_template", template_id)
    return {"ok": True}
