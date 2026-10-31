"""Recurring billing engine — the only place invoices are generated.

Duplicate-period prevention is two-layered:
  1. before insert, a query for (subscription_id, period_start) is checked;
  2. a unique sparse index on invoices (subscription_id, period_start) is the
     concurrency backstop (lib/db.py INDEXES) — a lost race raises
     DuplicateKeyError and is counted as skipped, never a second invoice.

Transactions note: this pod runs standalone mongod (no replica set), so multi-
document transactions are unavailable. The engine is therefore written
idempotently — insert the invoice first, advance `next_billing_date` after —
so a crash between the two steps replays safely. PostgreSQL migration gains
real transactions (see lib/repo.py).
"""
import calendar
import uuid
from datetime import date, datetime, timedelta, timezone

from pymongo.errors import DuplicateKeyError

from .db import db
from .dates import today_iso
from .money import discount_cents, tax_cents
from .numbering import next_number

REMINDER_STAGES_DAYS = [1, 3, 7, 14]
REMINDER_CHANNEL = "email"


def add_periods(start: date, billing_period: str, n: int = 1) -> date:
    if billing_period == "daily":
        return start + timedelta(days=n)
    if billing_period == "weekly":
        return start + timedelta(weeks=n)
    if billing_period == "monthly":
        total = start.month - 1 + n
        year = start.year + total // 12
        month = total % 12 + 1
        day = min(start.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)
    if billing_period == "yearly":
        year = start.year + n
        day = min(start.day, calendar.monthrange(year, start.month)[1])
        return date(year, start.month, day)
    raise ValueError(f"unknown billing period {billing_period}")


def period_end(start: date, billing_period: str) -> date:
    return add_periods(start, billing_period) - timedelta(days=1)


async def _pick_discount(subtotal_cents: int, quantity: int, today: date):
    """Best eligible discount for a billing line: fixed and percentage compete
    on the larger cents-off; eligibility = active, date window, minimums, usage."""
    query = {
        "active": True,
        "$or": [
            {"start_date": {"$in": [None, ""]}},
            {"start_date": {"$lte": today.isoformat()}},
        ],
        "$and": [
            {"$or": [{"end_date": {"$in": [None, ""]}}, {"end_date": {"$gte": today.isoformat()}}]},
            {"$or": [{"min_purchase_cents": {"$in": [None, 0]}}, {"min_purchase_cents": {"$lte": subtotal_cents}}]},
            {"$or": [{"min_quantity": {"$in": [None, 0]}}, {"min_quantity": {"$lte": quantity}}]},
            {"$or": [{"usage_limit": None}, {"$expr": {"$lt": ["$used_count", "$usage_limit"]}}]},
        ],
    }
    best: tuple[str | None, int] = (None, 0)
    async for d in db.discounts.find(query):
        amount = discount_cents(subtotal_cents, d["type"], d["value"])
        if amount > best[1]:
            best = (d["id"], amount)
    return best


async def close_subscription(sub: dict, actor, reason: str) -> None:
    await db.subscriptions.update_one(
        {"id": sub["id"]},
        {"$set": {"status": "closed", "close_reason": reason, "closed_at": today_iso()}},
    )
    from .auth import audit  # local import avoids a cycle at module load

    await audit(actor, "subscription.closed", "subscription", sub["id"], reason)


async def new_subscription_doc(
    customer_id: str,
    plan: dict,
    quantity: int,
    start_date: str,
    payment_terms_days: int,
    discount_id: str | None,
    created_by: str | None,
    quotation_id: str | None = None,
    status: str = "draft",
    is_demo: bool = False,
) -> dict:
    """Canonical subscription document. Tax is resolved server-side from the
    plan's tax (or the default tax); unit price comes from the plan."""
    tax_id = plan.get("tax_id")
    if tax_id:
        tax = await db.taxes.find_one({"id": tax_id})
        tax_bps = tax["rate_bps"] if tax else 0
    else:
        default_tax = await db.taxes.find_one({"is_default": True})
        tax_bps = default_tax["rate_bps"] if default_tax else 0
    return {
        "id": str(uuid.uuid4()),
        "number": await next_number("SUB-"),
        "customer_id": customer_id,
        "plan_id": plan["id"],
        "status": status,
        "start_date": start_date,
        "end_date": None,
        "billing_period": plan["billing_period"],
        "quantity": quantity,
        "unit_price_cents": plan["price_cents"],
        "tax_id": tax_id,
        "tax_bps": tax_bps,
        "discount_id": discount_id,
        "payment_terms_days": payment_terms_days,
        "next_billing_date": start_date,
        "paused": False,
        "quotation_id": quotation_id,
        "close_reason": None,
        "closed_at": None,
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_demo": is_demo,
    }


async def _build_invoice_for_subscription(sub: dict, ps: date, pe: date) -> dict:
    plan = await db.plans.find_one({"id": sub["plan_id"]})
    tax_bps = sub.get("tax_bps") or 0
    quantity = sub.get("quantity", 1)
    unit = sub.get("unit_price_cents", 0)
    subtotal = quantity * unit
    discount_id, discount = await _pick_discount(subtotal, quantity, ps)
    taxable = subtotal - discount
    tax = tax_cents(taxable, tax_bps)
    now = datetime.now(timezone.utc)
    terms = sub.get("payment_terms_days", 30)
    due = pe + timedelta(days=terms)
    period_label = f"{ps.isoformat()} → {pe.isoformat()}"
    return {
        "id": str(uuid.uuid4()),
        "number": await next_number("INV-"),
        "customer_id": sub["customer_id"],
        "subscription_id": sub["id"],
        "period_start": ps.isoformat(),
        "period_end": pe.isoformat(),
        "status": "confirmed",
        "issue_date": today_iso(),
        "due_date": due.isoformat(),
        "lines": [
            {
                "description": f"{plan['name'] if plan else 'Subscription'} — {period_label}",
                "quantity": quantity,
                "unit_price_cents": unit,
                "discount_cents": discount,
                "tax_bps": tax_bps,
                "tax_cents": tax,
                "line_total_cents": taxable + tax,
            }
        ],
        "subtotal_cents": subtotal,
        "discount_cents": discount,
        "tax_cents": tax,
        "total_cents": taxable + tax,
        "amount_paid_cents": 0,
        "notes": f"Recurring billing ({sub['billing_period']})",
        "created_by": sub.get("created_by"),
        "created_at": now.isoformat(),
        "is_demo": sub.get("is_demo", False),
        "discount_id": discount_id,
    }


async def generate_due_invoices() -> dict:
    """Bill every active, unpaused subscription whose next period has started."""
    today = date.fromisoformat(today_iso())
    created, closed, skipped = 0, [], 0
    subs = await db.subscriptions.find({"status": "active"}).to_list(2000)
    for sub in subs:
        if sub.get("paused"):
            continue
        end = sub.get("end_date")
        # Auto-close subscriptions whose availability/window has lapsed.
        if end and date.fromisoformat(end) < today:
            await close_subscription(sub, None, "Auto-closed: end date passed")
            closed.append(sub["number"])
            continue
        changed = False
        guard = 0
        while date.fromisoformat(sub["next_billing_date"]) <= today and guard < 120:
            guard += 1
            ps = date.fromisoformat(sub["next_billing_date"])
            if end and ps > date.fromisoformat(end):
                await close_subscription(sub, None, "Auto-closed: billing window complete")
                closed.append(sub["number"])
                changed = False
                break
            pe = period_end(ps, sub["billing_period"])
            exists = await db.invoices.find_one(
                {"subscription_id": sub["id"], "period_start": ps.isoformat()}
            )
            if exists:
                skipped += 1
            else:
                inv = await _build_invoice_for_subscription(sub, ps, pe)
                try:
                    await db.invoices.insert_one(inv)
                    created += 1
                except DuplicateKeyError:
                    skipped += 1
            nxt = add_periods(ps, sub["billing_period"])
            sub["next_billing_date"] = nxt.isoformat()
            changed = True
        if changed:
            await db.subscriptions.update_one(
                {"id": sub["id"]},
                {"$set": {"next_billing_date": sub["next_billing_date"]}},
            )
    reminders = await schedule_reminders()
    return {
        "invoices_created": created,
        "subscriptions_closed": closed,
        "already_billed_skipped": skipped,
        "overdue_invoices_tracked": reminders,
    }


async def overdue_invoices() -> list[dict]:
    today = today_iso()
    return await db.invoices.find(
        {
            "status": "confirmed",
            "$expr": {"$gt": [{"$subtract": ["$total_cents", "$amount_paid_cents"]}, 0]},
            "due_date": {"$lt": today},
        }
    ).to_list(1000)


async def schedule_reminders() -> int:
    """Ensure the dunning schedule (due+1/3/7/14) exists for every overdue invoice."""
    overdue = await overdue_invoices()
    tracked = 0
    today = date.fromisoformat(today_iso())
    for inv in overdue:
        due = date.fromisoformat(inv["due_date"])
        days_over = (today - due).days
        for stage, offset in enumerate(REMINDER_STAGES_DAYS, start=1):
            if days_over >= offset:
                exists = await db.reminders.find_one(
                    {"invoice_id": inv["id"], "stage": stage}
                )
                if not exists:
                    await db.reminders.insert_one(
                        {
                            "id": str(uuid.uuid4()),
                            "invoice_id": inv["id"],
                            "customer_id": inv["customer_id"],
                            "stage": stage,
                            "scheduled_date": (due + timedelta(days=offset)).isoformat(),
                            "status": "scheduled",
                            "channel": REMINDER_CHANNEL,
                            "note": "Email delivery not configured — record manually",
                            "created_at": datetime.now(timezone.utc),
                        }
                    )
                    tracked += 1
        _ = days_over
    return len(overdue)
