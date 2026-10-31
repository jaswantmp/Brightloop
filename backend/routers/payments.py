"""Payments recorded against invoices — partial payments supported."""
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import any_role, audit, customer_filter, staff_required
from lib.db import db
from lib.dates import today_iso
from lib.numbering import next_number
from models.billing import PaymentIn, PaymentOut

router = APIRouter(prefix="/payments", tags=["payments"])


def _out(doc: dict[str, Any], invoice_number: str | None = None, customer_name: str | None = None) -> dict[str, Any]:
    payload = {k: doc.get(k) for k in PaymentOut.model_fields}
    payload["invoice_number"] = invoice_number
    payload["customer_name"] = customer_name
    return payload


@router.get("", response_model=list[PaymentOut])
async def list_payments(
    invoice_id: str = "", method: str = "", principal=Depends(any_role)
):
    query = customer_filter(principal)
    if invoice_id:
        query["invoice_id"] = invoice_id
    if method:
        query["method"] = method
    docs = await db.payments.find(query).sort([("paid_at", -1), ("created_at", -1)]).to_list(1000)
    invoices = await db.invoices.find({"id": {"$in": [d["invoice_id"] for d in docs]}}).to_list(1000)
    customers = await db.customers.find({"id": {"$in": [d["customer_id"] for d in docs]}}).to_list(1000)
    imap = {i["id"]: i["number"] for i in invoices}
    cmap = {c["id"]: c["name"] for c in customers}
    return [_out(d, imap.get(d["invoice_id"]), cmap.get(d["customer_id"])) for d in docs]


@router.post("", response_model=PaymentOut, status_code=201)
async def record_payment(body: PaymentIn, principal=Depends(staff_required)):
    inv = await db.invoices.find_one({"id": body.invoice_id})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] != "confirmed":
        raise HTTPException(status_code=400, detail="Payments can only be recorded on confirmed invoices")
    balance = inv["total_cents"] - inv["amount_paid_cents"]
    if balance <= 0:
        raise HTTPException(status_code=400, detail="Invoice is already fully paid")
    if body.amount_cents > balance:
        raise HTTPException(status_code=400, detail=f"Amount exceeds outstanding balance ({balance} cents)")
    doc = {
        "id": str(uuid.uuid4()),
        "number": await next_number("PAY-"),
        "invoice_id": inv["id"],
        "customer_id": inv["customer_id"],
        "amount_cents": body.amount_cents,
        "method": body.method,
        "paid_at": body.paid_at or today_iso(),
        "note": body.note,
        "created_by": principal.user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payments.insert_one(doc)
    new_paid = inv["amount_paid_cents"] + body.amount_cents
    await db.invoices.update_one(
        {"id": inv["id"]},
        {"$set": {"amount_paid_cents": new_paid, "status": "paid" if new_paid >= inv["total_cents"] else "confirmed"}},
    )
    await audit(principal, "payment.recorded", "payment", doc["id"], f"{doc['number']} on {inv['number']}")
    return _out(doc, inv["number"])


class PayInvoicePublic(BaseModel):
    ok: bool
