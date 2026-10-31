"""Invoices: manual drafts, lifecycle, billing run trigger, duplicate-safe listing."""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import any_role, audit, customer_filter, load_scoped, staff_required
from lib.billing import generate_due_invoices
from lib.db import db
from lib.dates import today_iso
from lib.money import tax_cents
from lib.numbering import next_number
from models.billing import BillingRunOut, InvoiceIn, InvoiceOut

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _out(doc: dict[str, Any], customer_name: str | None = None) -> dict[str, Any]:
    payload = {k: doc.get(k) for k in InvoiceOut.model_fields}
    payload["customer_name"] = customer_name
    payload["balance_cents"] = doc["total_cents"] - doc["amount_paid_cents"]
    return payload


async def _names(docs: list[dict[str, Any]]) -> dict[str, str]:
    ids = {d["customer_id"] for d in docs}
    if not ids:
        return {}
    rows = await db.customers.find({"id": {"$in": list(ids)}}).to_list(1000)
    return {r["id"]: r["name"] for r in rows}


@router.get("", response_model=list[InvoiceOut])
async def list_invoices(
    status: str = "",
    customer_id: str = "",
    subscription_id: str = "",
    q: str = "",
    principal=Depends(any_role),
):
    query = customer_filter(principal, customer_id or None)
    if status:
        query["status"] = status
    if subscription_id:
        query["subscription_id"] = subscription_id
    if q:
        query["number"] = {"$regex": q, "$options": "i"}
    docs = await db.invoices.find(query).sort([("created_at", -1)]).to_list(1000)
    names = await _names(docs)
    return [_out(d, names.get(d["customer_id"])) for d in docs]


@router.get("/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(invoice_id: str, principal=Depends(any_role)):
    doc = await load_scoped(principal, "invoices", invoice_id)
    customer = await db.customers.find_one({"id": doc["customer_id"]})
    return _out(doc, customer["name"] if customer else None)


@router.post("", response_model=InvoiceOut, status_code=201)
async def create_invoice(body: InvoiceIn, principal=Depends(staff_required)):
    if not await db.customers.find_one({"id": body.customer_id}):
        raise HTTPException(status_code=404, detail="Customer not found")
    lines = []
    subtotal = discount_total = tax_total = 0
    for line in body.lines:
        line_subtotal = line.quantity * line.unit_price_cents
        taxable = line_subtotal - line.discount_cents
        tax = tax_cents(taxable, line.tax_bps)
        lines.append(
            {
                "description": line.description,
                "quantity": line.quantity,
                "unit_price_cents": line.unit_price_cents,
                "discount_cents": line.discount_cents,
                "tax_bps": line.tax_bps,
                "tax_cents": tax,
                "line_total_cents": taxable + tax,
            }
        )
        subtotal += line_subtotal
        discount_total += line.discount_cents
        tax_total += tax
    today = today_iso()
    settings = await db.settings.find_one({"id": "app"}) or {}
    due = body.due_date or (
        datetime.now(timezone.utc) + timedelta(days=settings.get("default_payment_terms_days", 30))
    ).date().isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "number": await next_number("INV-"),
        "customer_id": body.customer_id,
        "subscription_id": None,
        "period_start": None,
        "period_end": None,
        "status": "draft",
        "issue_date": today,
        "due_date": due,
        "lines": lines,
        "subtotal_cents": subtotal,
        "discount_cents": discount_total,
        "tax_cents": tax_total,
        "total_cents": subtotal - discount_total + tax_total,
        "amount_paid_cents": 0,
        "notes": body.notes,
        "created_by": principal.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_demo": False,
    }
    await db.invoices.insert_one(doc)
    await audit(principal, "invoice.created", "invoice", doc["id"], doc["number"])
    return _out(doc)


class InvoiceStatusIn(BaseModel):
    status: str


@router.post("/{invoice_id}/status", response_model=InvoiceOut)
async def set_invoice_status(invoice_id: str, body: InvoiceStatusIn, principal=Depends(staff_required)):
    doc = await load_scoped(principal, "invoices", invoice_id)
    flow: dict[str, list[str]] = {
        "draft": ["confirmed", "cancelled"],
        "confirmed": ["cancelled"],
    }
    if body.status not in flow.get(doc["status"], []):
        raise HTTPException(
            status_code=400, detail=f"Cannot move invoice from {doc['status']} to {body.status}"
        )
    await db.invoices.update_one({"id": invoice_id}, {"$set": {"status": body.status}})
    await audit(principal, f"invoice.{body.status}", "invoice", invoice_id)
    doc = await db.invoices.find_one({"id": invoice_id})
    customer = await db.customers.find_one({"id": doc["customer_id"]})
    return _out(doc, customer["name"] if customer else None)


@router.post("/billing/run", response_model=BillingRunOut)
async def run_billing(principal=Depends(staff_required)):
    """Manual billing run (the scheduled cron calls the same engine)."""
    summary = await generate_due_invoices()
    await audit(principal, "billing.run", "billing", None, f"{summary['invoices_created']} invoices")
    return BillingRunOut(**summary)
