"""Payment recovery: overdue queue, dunning schedule, reminder history.

Email delivery is intentionally NOT wired to a provider in this build — the
config endpoint reports that honestly and reminders are recorded manually.
"""
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import audit, staff_required
from lib.db import db
from lib.dates import today_iso

router = APIRouter(prefix="/recovery", tags=["recovery"])

STAGES = {1: "First reminder (due +1d)", 2: "Second reminder (due +3d)", 3: "Follow-up (due +7d)", 4: "Escalation (due +14d)"}


@router.get("/config")
async def recovery_config(_principal=Depends(staff_required)):
    return {
        "email_configured": False,
        "provider": None,
        "message": "Email delivery is not configured. Reminders are scheduled and tracked here; "
        "configure an email provider to deliver them automatically.",
    }


def _bucket(days: int) -> str:
    if days <= 3:
        return "1-3 days"
    if days <= 7:
        return "4-7 days"
    if days <= 14:
        return "8-14 days"
    return "15+ days"


@router.get("/queue")
async def recovery_queue(_principal=Depends(staff_required)):
    today = today_iso()
    docs = await db.invoices.find(
        {
            "status": "confirmed",
            "$expr": {"$gt": [{"$subtract": ["$total_cents", "$amount_paid_cents"]}, 0]},
            "due_date": {"$lt": today},
        }
    ).sort([("due_date", 1)]).to_list(500)
    customers = await db.customers.find({"id": {"$in": [d["customer_id"] for d in docs]}}).to_list(500)
    cmap = {c["id"]: c["name"] for c in customers}
    reminders = await db.reminders.find({"invoice_id": {"$in": [d["id"] for d in docs]}}).to_list(1000)
    today_d = date.fromisoformat(today)
    rows = []
    for d in docs:
        due = date.fromisoformat(d["due_date"])
        days = (today_d - due).days
        mine = [r for r in reminders if r["invoice_id"] == d["id"]]
        rows.append(
            {
                "invoice_id": d["id"],
                "invoice_number": d["number"],
                "customer_id": d["customer_id"],
                "customer_name": cmap.get(d["customer_id"]),
                "due_date": d["due_date"],
                "balance_cents": d["total_cents"] - d["amount_paid_cents"],
                "total_cents": d["total_cents"],
                "amount_paid_cents": d["amount_paid_cents"],
                "days_overdue": days,
                "bucket": _bucket(days),
                "reminders_sent": len([r for r in mine if r["status"] == "sent"]),
                "reminders_scheduled": len([r for r in mine if r["status"] == "scheduled"]),
            }
        )
    return rows


@router.get("/reminders")
async def list_reminders(status: str = "", _principal=Depends(staff_required)):
    query = {}
    if status:
        query["status"] = status
    docs = await db.reminders.find(query).sort([("scheduled_date", 1)]).to_list(1000)
    invoices = await db.invoices.find({"id": {"$in": [d["invoice_id"] for d in docs]}}).to_list(1000)
    customers = await db.customers.find({"id": {"$in": [d["customer_id"] for d in docs]}}).to_list(1000)
    imap = {i["id"]: i for i in invoices}
    cmap = {c["id"]: c["name"] for c in customers}
    rows = []
    for d in docs:
        inv = imap.get(d["invoice_id"], {})
        rows.append(
            {
                **{k: d.get(k) for k in ("id", "invoice_id", "customer_id", "stage", "scheduled_date", "status", "channel", "note", "sent_at")},
                "invoice_number": inv.get("number"),
                "customer_name": cmap.get(d["customer_id"]),
                "stage_label": STAGES.get(d["stage"], f"Stage {d['stage']}"),
                "balance_cents": inv.get("total_cents", 0) - inv.get("amount_paid_cents", 0),
            }
        )
    return rows


@router.post("/reminders/{reminder_id}/mark-sent")
async def mark_reminder_sent(reminder_id: str, principal=Depends(staff_required)):
    doc = await db.reminders.find_one({"id": reminder_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if doc["status"] != "scheduled":
        raise HTTPException(status_code=400, detail="Reminder is not in scheduled state")
    await db.reminders.update_one(
        {"id": reminder_id},
        {
            "$set": {
                "status": "sent",
                "sent_at": today_iso(),
                "note": "Recorded manually — email delivery is not configured",
            }
        },
    )
    await audit(principal, "reminder.marked_sent", "reminder", reminder_id)
    return {"ok": True}
