"""Reports: admin analytics, staff ops dashboard, customer portal summary, forecast.

Every figure is computed from stored records (payments, invoices, subscriptions)
inside the requested date range — no invented numbers. Aggregations run in
Python over scoped cursors: volumes here are hundreds of rows; swap to SQL
GROUP BY at PostgreSQL time via lib/repo.py.
"""
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query

from lib.auth import admin_required, customer_filter, require_roles
from lib.billing import overdue_invoices
from lib.db import db
from lib.dates import today_iso
from lib.money import normalized_monthly_cents
from models.system import DashboardOut, ForecastOut, OpsOut, PortalOut

router = APIRouter(prefix="/reports", tags=["reports"])


def month_starts(frm: date, to: date) -> list[date]:
    starts: list[date] = []
    y, m = frm.year, frm.month
    while date(y, m, 1) <= to:
        starts.append(date(y, m, 1))
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return starts


def _parse_date(val: str | None, default: date) -> date:
    if not val:
        return default
    val = val.strip()
    if not val:
        return default
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return default


def _range(from_d: str | None, to_d: str | None) -> tuple[date, date]:
    today = date.fromisoformat(today_iso())
    to = _parse_date(to_d, today)
    default_from = date(to.year - 1, to.month, 1)
    frm = _parse_date(from_d, default_from)
    if frm > to:
        frm, to = to, frm
    return frm, to


async def _active_subs() -> list[dict[str, Any]]:
    return await db.subscriptions.find({"status": "active"}).to_list(5000)


async def _mrr_cents() -> int:
    subs = await _active_subs()
    return sum(
        normalized_monthly_cents(s["unit_price_cents"] * s["quantity"], s["billing_period"])
        for s in subs
        if not s.get("paused")
    )


def _active_at(sub: dict[str, Any], day: str) -> bool:
    """Was the subscription live at end of `day`? (demo seed backdates start/closed_at)"""
    if sub.get("start_date", "9999") > day:
        return False
    if sub["status"] == "closed":
        return bool(sub.get("closed_at") and sub["closed_at"] > day)
    return True


async def _collected_by_month(frm: date, to: date) -> dict[str, int]:
    docs = await db.payments.find(
        {"paid_at": {"$gte": frm.isoformat(), "$lte": to.isoformat() + "T23:59:59Z"}}
    ).to_list(10000)
    out: dict[str, int] = {}
    for p in docs:
        paid_at = p.get("paid_at") or ""
        if len(paid_at) >= 7:
            out[paid_at[:7]] = out.get(paid_at[:7], 0) + p.get("amount_cents", 0)
    return out


@router.get("/dashboard", response_model=DashboardOut)
async def dashboard(
    from_d: str | None = Query(default=None),
    to_d: str | None = Query(default=None),
    _principal=Depends(admin_required),
):
    frm, to = _range(from_d, to_d)
    today = today_iso()
    today_d = date.fromisoformat(today)
    months = month_starts(frm, to)
    month_keys = [m.isoformat()[:7] for m in months]

    # KPIs
    subs = await _active_subs()
    mrr = sum(
        normalized_monthly_cents(s["unit_price_cents"] * s["quantity"], s["billing_period"])
        for s in subs
        if not s.get("paused")
    )
    collected = await _collected_by_month(frm, to)
    span_days = (to - frm).days + 1
    prev_to = frm - timedelta(days=1)
    prev_from = prev_to - timedelta(days=span_days - 1)
    prev_collected = await _collected_by_month(prev_from, prev_to)
    collected_total = sum(collected.values())
    prev_total = sum(prev_collected.values())

    overdue = await overdue_invoices()
    outstanding = await db.invoices.find(
        {"status": "confirmed", "$expr": {"$gt": [{"$subtract": ["$total_cents", "$amount_paid_cents"]}, 0]}}
    ).to_list(5000)
    outstanding_total = sum(i.get("total_cents", 0) - i.get("amount_paid_cents", 0) for i in outstanding)
    overdue_total = sum(i.get("total_cents", 0) - i.get("amount_paid_cents", 0) for i in overdue)

    upcoming_limit = (today_d + timedelta(days=30)).isoformat()
    upcoming = [
        s for s in subs
        if not s.get("paused") and s.get("next_billing_date") and s["next_billing_date"] <= upcoming_limit
    ]
    upcoming_cents = sum(s.get("unit_price_cents", 0) * s.get("quantity", 1) for s in upcoming)

    kpis = {
        "mrr_cents": mrr,
        "arr_cents": mrr * 12,
        "active_subs": len(subs),
        "collected_cents": collected_total,
        "collected_change_pct": round((collected_total - prev_total) * 100 / prev_total, 1) if prev_total else None,
        "outstanding_cents": outstanding_total,
        "overdue_cents": overdue_total,
        "overdue_count": len(overdue),
        "upcoming_30d_cents": upcoming_cents,
        "upcoming_30d_count": len(upcoming),
    }

    # Revenue trend (collected payments per month)
    revenue_trend = [{"month": k, "collected_cents": collected.get(k, 0)} for k in month_keys]

    # Subscription growth: active at each month boundary
    all_subs = await db.subscriptions.find({}).to_list(5000)
    sub_growth = []
    for m in months:
        month_end = (m + timedelta(days=31)).replace(day=1) - timedelta(days=1)
        day = min(month_end, to).isoformat()
        sub_growth.append(
            {"month": m.isoformat()[:7], "active": sum(1 for s in all_subs if _active_at(s, day))}
        )

    # Invoice status donut — current truth, incl. overdue split out of unpaid
    all_invoices = await db.invoices.find({}).to_list(10000)
    status_rows: dict[str, dict[str, int]] = {}
    for inv in all_invoices:
        balance = inv.get("total_cents", 0) - inv.get("amount_paid_cents", 0)
        due_d = inv.get("due_date") or ""
        if inv.get("status") == "confirmed" and balance > 0 and due_d and due_d < today:
            st = "overdue"
        else:
            st = inv.get("status", "draft")
        row = status_rows.setdefault(st, {"status": st, "count": 0, "amount_cents": 0})
        row["count"] += 1
        row["amount_cents"] += inv.get("total_cents", 0)
    invoice_status = list(status_rows.values())

    # Revenue breakdown by plan (billed amounts of subscription invoices)
    plan_ids = {i.get("subscription_id") for i in all_invoices if i.get("subscription_id")}
    subs_by_id = {s["id"]: s for s in all_subs}
    plans = await db.plans.find({"id": {"$in": [s["plan_id"] for s in subs_by_id.values()]}}).to_list(1000)
    pmap = {p["id"]: p["name"] for p in plans}
    by_plan: dict[tuple, int] = {}
    for inv in all_invoices:
        if not inv.get("subscription_id") or not (month_key := (inv.get("issue_date") or "")[:7]):
            continue
        if month_key not in month_keys:
            continue
        sub = subs_by_id.get(inv["subscription_id"])
        if not sub:
            continue
        key = (month_key, pmap.get(sub["plan_id"], "Unknown"))
        by_plan[key] = by_plan.get(key, 0) + inv.get("total_cents", 0)
    revenue_by_plan = [
        {"month": k[0], "plan": k[1], "revenue_cents": v} for k, v in by_plan.items()
    ]

    # Overdue ageing
    buckets = {"1-3 days": [0, 0], "4-7 days": [0, 0], "8-14 days": [0, 0], "15+ days": [0, 0]}
    for inv in overdue:
        due_str = inv.get("due_date")
        if not due_str:
            continue
        try:
            days = (today_d - date.fromisoformat(due_str)).days
        except (ValueError, TypeError):
            continue
        b = "1-3 days" if days <= 3 else "4-7 days" if days <= 7 else "8-14 days" if days <= 14 else "15+ days"
        buckets[b][0] += 1
        buckets[b][1] += inv.get("total_cents", 0) - inv.get("amount_paid_cents", 0)
    overdue_ageing = [
        {"bucket": b, "count": v[0], "amount_cents": v[1]} for b, v in buckets.items()
    ]

    # Forecast: actuals from payments history, projection = current MRR held flat
    actual_by_month = await _collected_by_month(date(to.year - 1, to.month, 1), to)
    forecast = []
    for m in month_starts(date(to.year - 1, to.month, 1), to):
        forecast.append(
            {"month": m.isoformat()[:7], "actual_cents": actual_by_month.get(m.isoformat()[:7], 0), "projected_cents": None}
        )
    future = date(to.year, to.month, 1) if to.day > 1 else to
    for i in range(1, 7):
        fm = month_starts(future, future)[0]
        future = date(future.year + (1 if future.month == 12 else 0), 1 if future.month == 12 else future.month + 1, 1)
        forecast.append({"month": fm.isoformat()[:7], "actual_cents": None, "projected_cents": mrr})

    # Tables
    recent = await db.invoices.find({}).sort([("created_at", -1)]).to_list(6)
    cids = {d.get("customer_id") for d in recent if d.get("customer_id")}
    custs = await db.customers.find({"id": {"$in": list(cids)}}).to_list(100)
    cmap = {c["id"]: c["name"] for c in custs}
    recent_invoices = [
        {
            "id": d["id"], "number": d["number"], "customer_name": cmap.get(d.get("customer_id")),
            "status": d.get("status"), "total_cents": d.get("total_cents", 0),
            "balance_cents": d.get("total_cents", 0) - d.get("amount_paid_cents", 0), "due_date": d.get("due_date"),
        }
        for d in recent
    ]
    recovery_alerts = []
    for d in overdue:
        due_str = d.get("due_date")
        if not due_str:
            continue
        try:
            days_overdue = (today_d - date.fromisoformat(due_str)).days
        except (ValueError, TypeError):
            continue
        recovery_alerts.append({
            "invoice_id": d["id"],
            "invoice_number": d["number"],
            "customer_name": cmap.get(d.get("customer_id")),
            "balance_cents": d.get("total_cents", 0) - d.get("amount_paid_cents", 0),
            "days_overdue": days_overdue,
        })
    recovery_alerts = sorted(recovery_alerts, key=lambda r: r["days_overdue"], reverse=True)[:6]

    return DashboardOut(
        kpis=kpis,
        revenue_trend=revenue_trend,
        sub_growth=sub_growth,
        invoice_status=invoice_status,
        revenue_by_plan=revenue_by_plan,
        overdue_ageing=overdue_ageing,
        forecast=forecast,
        recent_invoices=recent_invoices,
        recovery_alerts=recovery_alerts,
        is_demo=True,
    )


@router.get("/ops", response_model=OpsOut)
async def ops(_principal=Depends(require_roles("ADMIN", "STAFF"))):
    today = date.fromisoformat(today_iso())
    today_s = today_iso()
    subs = await _active_subs()
    customer_ids = {s.get("customer_id") for s in subs if s.get("customer_id")}
    customers = await db.customers.find({"id": {"$in": list(customer_ids)}}).to_list(2000)
    cmap = {c["id"]: c["name"] for c in customers}
    plans = await db.plans.find({}).to_list(1000)
    pmap = {p["id"]: p["name"] for p in plans}

    upcoming = sorted(
        [
            s
            for s in subs
            if not s.get("paused") and s.get("next_billing_date") and s["next_billing_date"] <= (today + timedelta(days=30)).isoformat()
        ],
        key=lambda s: s["next_billing_date"],
    )[:10]
    upcoming_rows = [
        {
            "id": s["id"], "number": s["number"], "customer_name": cmap.get(s.get("customer_id")),
            "plan_name": pmap.get(s.get("plan_id")), "next_billing_date": s.get("next_billing_date"),
            "amount_cents": s.get("unit_price_cents", 0) * s.get("quantity", 1), "billing_period": s.get("billing_period"),
        }
        for s in upcoming
    ]

    overdue = await overdue_invoices()
    overdue_rows = []
    for d in overdue:
        due_str = d.get("due_date")
        if not due_str:
            continue
        try:
            days_overdue = (today - date.fromisoformat(due_str)).days
        except (ValueError, TypeError):
            continue
        overdue_rows.append({
            "invoice_id": d["id"],
            "invoice_number": d["number"],
            "customer_name": cmap.get(d.get("customer_id")),
            "balance_cents": d.get("total_cents", 0) - d.get("amount_paid_cents", 0),
            "due_date": d.get("due_date"),
            "days_overdue": days_overdue,
        })
    overdue_rows = sorted(overdue_rows, key=lambda r: r["days_overdue"], reverse=True)[:10]

    recent_customers = await db.customers.find().sort([("created_at", -1)]).to_list(6)
    quotations_awaiting = await db.quotations.count_documents({"status": "sent"})

    month_payments = await db.payments.find({"paid_at": {"$gte": today_s[:7] + "-01"}}).to_list(5000)
    return OpsOut(
        kpis={
            "active_subs": len(subs),
            "upcoming_30d_cents": sum(r["amount_cents"] for r in upcoming_rows),
            "overdue_count": len(overdue),
            "overdue_cents": sum(d.get("total_cents", 0) - d.get("amount_paid_cents", 0) for d in overdue),
            "quotations_awaiting": quotations_awaiting,
            "collected_this_month_cents": sum(p.get("amount_cents", 0) for p in month_payments),
        },
        upcoming_billing=upcoming_rows,
        overdue_followups=overdue_rows,
        recent_customers=[
            {"id": c["id"], "name": c["name"], "company": c.get("company", ""), "created_at": c.get("created_at", "")}
            for c in recent_customers
        ],
    )


@router.get("/portal", response_model=PortalOut)
async def portal(principal=Depends(require_roles("CUSTOMER"))):
    today = date.fromisoformat(today_iso())
    today_s = today_iso()
    scope = customer_filter(principal)
    subs = await db.subscriptions.find({**scope, "status": "active"}).to_list(500)
    invoices = await db.invoices.find(scope).sort([("due_date", -1)]).to_list(1000)
    payments = await db.payments.find(scope).sort([("paid_at", -1)]).to_list(100)
    plans = await db.plans.find({}).to_list(500)
    pmap = {p["id"]: p["name"] for p in plans}

    open_inv = [
        d for d in invoices
        if d.get("status") == "confirmed" and d.get("total_cents", 0) - d.get("amount_paid_cents", 0) > 0
    ]
    next_due = min((d["due_date"] for d in open_inv if d.get("due_date")), default=None)
    return PortalOut(
        kpis={
            "active_subs": len(subs),
            "outstanding_cents": sum(d.get("total_cents", 0) - d.get("amount_paid_cents", 0) for d in open_inv),
            "overdue_count": len([d for d in open_inv if d.get("due_date") and d["due_date"] < today_s]),
            "paid_last_12m_cents": sum(
                p.get("amount_cents", 0) for p in payments if p.get("paid_at") and p["paid_at"] >= (today - timedelta(days=365)).isoformat()
            ),
            "next_due_date": next_due,
        },
        active_subscriptions=[
            {
                "id": s["id"], "number": s["number"], "plan_name": pmap.get(s.get("plan_id")),
                "status": s.get("status"), "paused": s.get("paused", False),
                "billing_period": s.get("billing_period"), "quantity": s.get("quantity", 1),
                "unit_price_cents": s.get("unit_price_cents", 0), "next_billing_date": s.get("next_billing_date"),
                "end_date": s.get("end_date"),
            }
            for s in subs
        ],
        open_invoices=[
            {
                "id": d["id"], "number": d["number"], "status": d.get("status"),
                "total_cents": d.get("total_cents", 0), "balance_cents": d.get("total_cents", 0) - d.get("amount_paid_cents", 0),
                "due_date": d.get("due_date"), "issue_date": d.get("issue_date"),
            }
            for d in sorted(open_inv, key=lambda x: x.get("due_date") or "")[:10]
        ],
        recent_payments=[
            {
                "id": p["id"], "number": p["number"], "amount_cents": p.get("amount_cents", 0),
                "paid_at": p.get("paid_at"), "method": p.get("method"), "invoice_id": p.get("invoice_id"),
            }
            for p in payments[:5]
        ],
    )


@router.get("/forecast", response_model=ForecastOut)
async def forecast(
    horizon_months: int = Query(default=6, ge=1, le=12),
    _principal=Depends(admin_required),
):
    frm, to = _range(None, None)
    actual = await _collected_by_month(frm, to)
    mrr = await _mrr_cents()
    series = []
    for m in month_starts(frm, to):
        series.append({"month": m.isoformat()[:7], "actual_cents": actual.get(m.isoformat()[:7], 0), "projected_cents": None})
    cursor = date(to.year, to.month, 1)
    for _ in range(horizon_months):
        cursor = date(cursor.year + (1 if cursor.month == 12 else 0), 1 if cursor.month == 12 else cursor.month + 1, 1)
        series.append({"month": cursor.isoformat()[:7], "actual_cents": None, "projected_cents": mrr})
    return ForecastOut(
        mrr_cents=mrr,
        arr_cents=mrr * 12,
        series=series,
        assumptions=[
            "Projection holds current MRR flat over the horizon.",
            "MRR normalizes each active subscription to a monthly figure (daily x30, weekly x52/12, monthly x1, yearly /12).",
            "Renewals assumed for subscriptions with renewal enabled; paused subscriptions are excluded.",
            "Actuals are collected payments in each month — no accruals, no pipeline weighting.",
        ],
    )
