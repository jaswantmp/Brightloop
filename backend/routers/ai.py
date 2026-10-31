"""AI finance assistant — config-driven (OpenAI or Google Gemini), read-only context.

The backend computes a role-scoped financial summary and hands it to the model
as JSON. There is no SQL/exec surface at all: the model can only reason over
the numbers this function assembles, and a CUSTOMER's context only ever
contains their own records.
"""
import os
from typing import Any, Tuple

import httpx
from fastapi import APIRouter, Depends

from lib.auth import Principal, customer_filter, require_roles
from lib.db import db
from lib.dates import today_iso
from lib.money import normalized_monthly_cents, format_money
from models.system import AIAnswerOut, AIAskIn, AIStatusOut

router = APIRouter(prefix="/ai", tags=["ai"])

SYSTEM_PROMPT = (
    "You are Brightloop's finance assistant for a subscription business. "
    "Answer ONLY from the JSON snapshot provided. If the snapshot lacks the data needed, "
    "say so plainly instead of guessing. Be concise; use the provided currency formatting. "
    "The snapshot is already scoped to the requesting user's permissions — never invent records."
)


def _active_provider() -> Tuple[str | None, str | None, str | None]:
    """Resolve active provider, API key, and model.

    Precedence:
    1. Explicit AI_PROVIDER ("openai" or "gemini")
    2. OPENAI_API_KEY -> OpenAI (default: gpt-4o-mini)
    3. GEMINI_API_KEY or GOOGLE_API_KEY -> Gemini (default: gemini-2.5-flash)
    """
    forced = os.environ.get("AI_PROVIDER", "").strip().lower()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip() or os.environ.get("GOOGLE_API_KEY", "").strip()

    if forced == "gemini":
        if gemini_key:
            return "gemini", gemini_key, os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip()
        return None, None, None

    if forced == "openai":
        if openai_key:
            return "openai", openai_key, os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip()
        return None, None, None

    if openai_key:
        return "openai", openai_key, os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip()

    if gemini_key:
        return "gemini", gemini_key, os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip()

    return None, None, None


def _configured() -> bool:
    provider, key, _ = _active_provider()
    return bool(provider and key)


@router.get("/status", response_model=AIStatusOut)
async def ai_status(_principal=Depends(require_roles("ADMIN", "STAFF", "CUSTOMER"))):
    provider, _, model = _active_provider()
    return AIStatusOut(configured=bool(provider), model=model if provider else None)


async def _context(principal: Principal) -> dict[str, Any]:
    """Read-only, role-scoped financial snapshot for the model."""
    today_s = today_iso()
    scope = customer_filter(principal)
    subs = await db.subscriptions.find({**scope, "status": "active"}).to_list(200)
    mrr = sum(
        normalized_monthly_cents(s["unit_price_cents"] * s["quantity"], s["billing_period"])
        for s in subs
        if not s.get("paused")
    )
    invoices = await db.invoices.find(scope).sort([("created_at", -1)]).to_list(100)
    payments = await db.payments.find(scope).sort([("paid_at", -1)]).to_list(20)
    open_inv = [
        i for i in invoices
        if i.get("status") == "confirmed" and (i.get("total_cents", 0) - i.get("amount_paid_cents", 0)) > 0
    ]
    overdue_inv = [i for i in open_inv if i.get("due_date") and i["due_date"] < today_s]
    overdue_balance = sum(i.get("total_cents", 0) - i.get("amount_paid_cents", 0) for i in overdue_inv)

    plans = await db.plans.find({}).to_list(50)

    # Revenue and subscription breakdown by plan
    plan_counts: dict[str, int] = {}
    plan_revenue: dict[str, int] = {}
    for s in subs:
        if s.get("paused"):
            continue
        pid = s.get("plan_id")
        if pid:
            plan_counts[pid] = plan_counts.get(pid, 0) + s.get("quantity", 1)
            plan_revenue[pid] = plan_revenue.get(pid, 0) + normalized_monthly_cents(
                s.get("unit_price_cents", 0) * s.get("quantity", 1), s.get("billing_period", "monthly")
            )

    plans_summary = []
    for p in plans:
        if not p.get("active", True):
            continue
        pid = p["id"]
        plans_summary.append({
            "name": p["name"],
            "billing_period": p["billing_period"],
            "price": format_money(p["price_cents"]),
            "active_subscriptions": plan_counts.get(pid, 0),
            "monthly_revenue": format_money(plan_revenue.get(pid, 0)),
            "_rev": plan_revenue.get(pid, 0),
        })
    plans_summary.sort(key=lambda x: x["_rev"], reverse=True)
    for p in plans_summary:
        del p["_rev"]

    return {
        "today": today_s,
        "currency": "USD",
        "active_subscriptions": len(subs),
        "mrr": format_money(mrr),
        "arr": format_money(mrr * 12),
        "overdue_invoices_count": len(overdue_inv),
        "overdue_total_balance": format_money(overdue_balance),
        "overdue_invoices": [
            {
                "number": i["number"],
                "total": format_money(i.get("total_cents", 0)),
                "balance": format_money(i.get("total_cents", 0) - i.get("amount_paid_cents", 0)),
                "due_date": i.get("due_date"),
            }
            for i in sorted(overdue_inv, key=lambda x: x.get("due_date") or "")[:10]
        ],
        "open_invoices": [
            {
                "number": i["number"],
                "status": i.get("status"),
                "total": format_money(i.get("total_cents", 0)),
                "balance": format_money(i.get("total_cents", 0) - i.get("amount_paid_cents", 0)),
                "due_date": i.get("due_date"),
            }
            for i in open_inv[:10]
        ],
        "recent_payments": [
            {
                "number": p["number"],
                "amount": format_money(p.get("amount_cents", 0)),
                "paid_at": p.get("paid_at"),
                "method": p.get("method"),
            }
            for p in payments[:10]
        ],
        "plans": plans_summary,
        "note": "All figures derive strictly from stored records; any metric not present must be reported as unavailable.",
    }


async def _call_openai(api_key: str, model: str, context: dict, question: str) -> Tuple[str | None, str | None]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Financial snapshot (JSON):\n{context}\n\nQuestion: {question}",
            },
        ],
        "temperature": 0.2,
    }
    async with httpx.AsyncClient(timeout=45.0) as client:
        res = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)

    if res.status_code == 200:
        data = res.json()
        return data["choices"][0]["message"]["content"], None

    if res.status_code in (401, 403):
        return None, "AI provider authentication failed: check your OPENAI_API_KEY in backend/.env."
    if res.status_code == 429:
        return None, "OpenAI rate limit exceeded or quota exhausted. Please try again later."
    if res.status_code >= 500:
        return None, f"OpenAI service unavailable (HTTP {res.status_code}). Please try again later."
    return None, f"OpenAI returned error HTTP {res.status_code}."


async def _call_gemini(api_key: str, model: str, context: dict, question: str) -> Tuple[str | None, str | None]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "system_instruction": {
            "parts": [{"text": SYSTEM_PROMPT}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": f"Financial snapshot (JSON):\n{context}\n\nQuestion: {question}"}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2
        }
    }
    async with httpx.AsyncClient(timeout=45.0) as client:
        res = await client.post(url, headers=headers, json=payload)

    if res.status_code == 200:
        data = res.json()
        candidates = data.get("candidates", [])
        if candidates and "content" in candidates[0] and "parts" in candidates[0]["content"]:
            parts = candidates[0]["content"]["parts"]
            if parts and "text" in parts[0]:
                return parts[0]["text"], None
        return None, "Gemini returned an empty response."

    if res.status_code in (400, 403):
        return None, "AI provider authentication failed: check your GEMINI_API_KEY in backend/.env."
    if res.status_code == 429:
        return None, "Gemini rate limit exceeded. Please try again in a few moments."
    if res.status_code >= 500:
        return None, f"Gemini service unavailable (HTTP {res.status_code}). Please try again later."
    return None, f"Gemini returned error HTTP {res.status_code}."


@router.post("/assistant", response_model=AIAnswerOut)
async def assistant(body: AIAskIn, principal=Depends(require_roles("ADMIN", "STAFF", "CUSTOMER"))):
    provider, key, model = _active_provider()
    if not provider or not key:
        return AIAnswerOut(
            configured=False,
            answer=None,
            error=(
                "AI assistant is not configured. Set OPENAI_API_KEY (and optionally OPENAI_MODEL) "
                "or GEMINI_API_KEY (and optionally GEMINI_MODEL) in the backend environment to enable it."
            ),
        )

    context = await _context(principal)

    try:
        if provider == "openai":
            answer, error = await _call_openai(key, model or "gpt-4o-mini", context, body.question)
        elif provider == "gemini":
            answer, error = await _call_gemini(key, model or "gemini-2.5-flash", context, body.question)
        else:
            return AIAnswerOut(configured=False, answer=None, error="Unknown AI provider.")

        return AIAnswerOut(configured=True, answer=answer, error=error)
    except httpx.TimeoutException:
        return AIAnswerOut(configured=True, answer=None, error="AI request timed out. Please try again.")
    except httpx.RequestError:
        return AIAnswerOut(configured=True, answer=None, error="AI network error: could not connect to AI provider.")
    except Exception as exc:
        return AIAnswerOut(configured=True, answer=None, error=f"AI request failed: {type(exc).__name__}")
