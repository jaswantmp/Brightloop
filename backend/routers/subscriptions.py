"""Subscription lifecycle: Draft → Quotation → Confirmed → Active → Closed,
plus customer-initiated change requests (backend-approved)."""
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from lib.auth import (
    any_role,
    audit,
    customer_filter,
    load_scoped,
    staff_required,
)
from lib.billing import add_periods, new_subscription_doc
from lib.db import db
from lib.dates import today_iso
from models.billing import (
    ActionIn,
    ChangeRequestIn,
    ChangeRequestOut,
    SubscriptionIn,
    SubscriptionOut,
)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


def _out(doc: dict[str, Any], customer_name: str | None = None, plan_name: str | None = None) -> dict[str, Any]:
    payload = {k: doc.get(k) for k in SubscriptionOut.model_fields}
    payload["customer_name"] = customer_name
    payload["plan_name"] = plan_name
    return payload


async def _joins(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    customer_ids = {d["customer_id"] for d in docs}
    plan_ids = {d["plan_id"] for d in docs}
    customers = await db.customers.find({"id": {"$in": list(customer_ids)}}).to_list(1000)
    plans = await db.plans.find({"id": {"$in": list(plan_ids)}}).to_list(1000)
    cmap = {c["id"]: c["name"] for c in customers}
    pmap = {p["id"]: p["name"] for p in plans}
    return [_out(d, cmap.get(d["customer_id"]), pmap.get(d["plan_id"])) for d in docs]


@router.get("", response_model=list[SubscriptionOut])
async def list_subscriptions(
    status: str = "", customer_id: str = "", q: str = "", principal=Depends(any_role)
):
    query = customer_filter(principal, customer_id or None)
    if status:
        query["status"] = status
    if q:
        query["number"] = {"$regex": q, "$options": "i"}
    docs = await db.subscriptions.find(query).sort([("created_at", -1)]).to_list(1000)
    return await _joins(docs)


@router.get("/{subscription_id}", response_model=SubscriptionOut)
async def get_subscription(subscription_id: str, principal=Depends(any_role)):
    doc = await load_scoped(principal, "subscriptions", subscription_id)
    return (await _joins([doc]))[0]


@router.post("", response_model=SubscriptionOut, status_code=201)
async def create_subscription(body: SubscriptionIn, principal=Depends(staff_required)):
    customer = await db.customers.find_one({"id": body.customer_id})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    plan = await db.plans.find_one({"id": body.plan_id})
    if not plan or not plan.get("active", True):
        raise HTTPException(status_code=404, detail="Plan not found or inactive")
    start = body.start_date or today_iso()
    # Availability window + minimum quantity rules (plan-governed).
    if plan.get("available_from") and start < plan["available_from"]:
        raise HTTPException(status_code=422, detail=f"Plan is available from {plan['available_from']}")
    if plan.get("available_to") and start > plan["available_to"]:
        raise HTTPException(status_code=422, detail=f"Plan availability ended {plan['available_to']}")
    if body.quantity < plan.get("min_quantity", 1):
        raise HTTPException(status_code=422, detail=f"Minimum quantity for this plan is {plan.get('min_quantity', 1)}")
    settings = await db.settings.find_one({"id": "app"}) or {}
    doc = await new_subscription_doc(
        customer_id=body.customer_id,
        plan=plan,
        quantity=body.quantity,
        start_date=start,
        payment_terms_days=body.payment_terms_days
        if body.payment_terms_days is not None
        else settings.get("default_payment_terms_days", 30),
        discount_id=body.discount_id,
        created_by=principal.user_id,
        status="draft",
    )
    await db.subscriptions.insert_one(doc)
    await audit(principal, "subscription.created", "subscription", doc["id"], doc["number"])
    return (await _joins([doc]))[0]


async def apply_action(
    sub: dict[str, Any], action: str, principal, end_date: str | None = None, reason: str = ""
) -> dict[str, Any]:
    """Every lifecycle transition, with plan rules enforced server-side."""
    plan = (await db.plans.find_one({"id": sub["plan_id"]})) or {}
    today = today_iso()
    status = sub["status"]
    updates: dict[str, Any] = {}
    if action == "confirm":
        if status not in ("draft", "quotation"):
            raise HTTPException(status_code=400, detail=f"Cannot confirm from {status}")
        updates["status"] = "confirmed"
    elif action == "activate":
        if status != "confirmed":
            raise HTTPException(status_code=400, detail=f"Cannot activate from {status}")
        updates["status"] = "active"
        updates["next_billing_date"] = max(sub["start_date"], today)
    elif action == "pause":
        if status != "active" or sub.get("paused"):
            raise HTTPException(status_code=400, detail="Only active subscriptions can be paused")
        if not plan.get("allow_pause", True):
            raise HTTPException(status_code=400, detail="This plan does not allow pausing")
        updates["paused"] = True
    elif action == "resume":
        if not sub.get("paused"):
            raise HTTPException(status_code=400, detail="Subscription is not paused")
        if not plan.get("allow_pause", True):
            raise HTTPException(status_code=400, detail="This plan does not allow pausing/resuming")
        updates["paused"] = False
        updates["next_billing_date"] = max(sub.get("next_billing_date") or today, today)
    elif action == "close":
        if status not in ("confirmed", "active"):
            raise HTTPException(status_code=400, detail=f"Cannot close from {status}")
        if (
            status == "active"
            and sub.get("end_date")
            and today < sub["end_date"]
            and not plan.get("allow_early_close", True)
        ):
            raise HTTPException(status_code=400, detail="This plan does not allow early closure")
        updates["status"] = "closed"
        updates["close_reason"] = reason or "Closed manually"
        updates["closed_at"] = today
    elif action == "renew":
        if not plan.get("allow_renewal", True):
            raise HTTPException(status_code=400, detail="This plan does not allow renewal")
        if status not in ("active", "closed"):
            raise HTTPException(status_code=400, detail=f"Cannot renew from {status}")
        base = sub.get("end_date") or today
        if base < today:
            base = today
        updates["end_date"] = add_periods(date.fromisoformat(base), sub["billing_period"]).isoformat()
        if status == "closed":
            updates["status"] = "active"
            updates["close_reason"] = None
            updates["closed_at"] = None
            updates["paused"] = False
            updates["next_billing_date"] = today
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to change")
    await db.subscriptions.update_one({"id": sub["id"]}, {"$set": updates})
    await audit(principal, f"subscription.{action}", "subscription", sub["id"], reason)
    doc = await db.subscriptions.find_one({"id": sub["id"]})
    return (await _joins([doc or {}]))[0]


@router.post("/{subscription_id}/actions", response_model=SubscriptionOut)
async def subscription_action(
    subscription_id: str, body: ActionIn, principal=Depends(staff_required)
):
    sub = await load_scoped(principal, "subscriptions", subscription_id)
    return await apply_action(sub, body.action, principal, end_date=body.end_date)


@router.post("/{subscription_id}/renew-self", response_model=SubscriptionOut)
async def renew_own_subscription(subscription_id: str, principal=Depends(any_role)):
    """Customer-permitted action: renew your OWN eligible subscription.
    Plan renewal rules + ownership are enforced here (load_scoped + apply_action)."""
    sub = await load_scoped(principal, "subscriptions", subscription_id)
    return await apply_action(sub, "renew", principal, reason="Renewed by customer")


# --- customer change requests --------------------------------------------
class DecisionIn(BaseModel):
    approved: bool


def _cr_out(doc: dict[str, Any], sub_number: str | None = None, customer_name: str | None = None) -> dict[str, Any]:
    payload = {k: doc.get(k) for k in ChangeRequestOut.model_fields}
    payload["subscription_number"] = sub_number
    payload["customer_name"] = customer_name
    return payload


@router.get("/change-requests/all", response_model=list[ChangeRequestOut])
async def list_change_requests(status: str = "", principal=Depends(any_role)):
    query = customer_filter(principal)
    if status:
        query["status"] = status
    docs = await db.change_requests.find(query).sort([("created_at", -1)]).to_list(500)
    subs = await db.subscriptions.find({"id": {"$in": [d["subscription_id"] for d in docs]}}).to_list(500)
    customers = await db.customers.find({"id": {"$in": [d["customer_id"] for d in docs]}}).to_list(500)
    smap = {s["id"]: s["number"] for s in subs}
    cmap = {c["id"]: c["name"] for c in customers}
    return [_cr_out(d, smap.get(d["subscription_id"]), cmap.get(d["customer_id"])) for d in docs]


@router.post("/change-requests", response_model=ChangeRequestOut, status_code=201)
async def create_change_request(body: ChangeRequestIn, principal=Depends(any_role)):
    sub = await load_scoped(principal, "subscriptions", body.subscription_id)
    if sub["status"] not in ("confirmed", "active"):
        raise HTTPException(status_code=400, detail="Requests apply to confirmed or active subscriptions")
    if body.type == "quantity_change" and (not body.quantity_new or body.quantity_new < 1):
        raise HTTPException(status_code=422, detail="quantity_new must be at least 1")
    doc = {
        "id": str(uuid.uuid4()),
        "subscription_id": body.subscription_id,
        "customer_id": sub["customer_id"],
        "type": body.type,
        "details": body.details,
        "quantity_new": body.quantity_new,
        "status": "pending",
        "created_at": today_iso(),
        "decided_at": None,
        "decided_by": None,
    }
    await db.change_requests.insert_one(doc)
    await audit(principal, "change_request.created", "change_request", doc["id"], body.type)
    return _cr_out(doc, sub["number"])


@router.post("/change-requests/{cr_id}/decide", response_model=ChangeRequestOut)
async def decide_change_request(cr_id: str, body: DecisionIn, principal=Depends(staff_required)):
    cr = await db.change_requests.find_one({"id": cr_id})
    if not cr:
        raise HTTPException(status_code=404, detail="Not found")
    if cr["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request already decided")
    sub = await db.subscriptions.find_one({"id": cr["subscription_id"]})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription no longer exists")
    if body.approved:
        cr_type = cr["type"]
        if cr_type == "quantity_change":
            await db.subscriptions.update_one(
                {"id": sub["id"]}, {"$set": {"quantity": cr["quantity_new"] or sub["quantity"]}}
            )
            await audit(principal, "subscription.quantity_changed", "subscription", sub["id"], str(cr["quantity_new"]))
        else:
            action = {"pause": "pause", "resume": "resume", "renew": "renew", "cancel": "close"}.get(cr_type)
            if action:
                await apply_action(sub, action, principal, reason=f"Approved customer request ({cr_type})")
    updates = {
        "status": "approved" if body.approved else "rejected",
        "decided_at": today_iso(),
        "decided_by": principal.email,
    }
    await db.change_requests.update_one({"id": cr_id}, {"$set": updates})
    await audit(principal, f"change_request.{updates['status']}", "change_request", cr_id)
    cr = await db.change_requests.find_one({"id": cr_id})
    sub = await db.subscriptions.find_one({"id": cr["subscription_id"]}) or {}
    return _cr_out(cr, sub.get("number"))
