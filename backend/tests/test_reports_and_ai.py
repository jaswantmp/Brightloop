import sys
from pathlib import Path

BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import pytest
import os
from datetime import date
from mongomock_motor import AsyncMongoMockClient

import lib.db as db_mod
from lib.auth import Principal, login, COOKIE_NAME
from lib.money import normalized_monthly_cents, PERIOD_MONTHS, format_money
from routers.reports import _range, month_starts
from routers.ai import _active_provider, _configured, _context
from models.system import DashboardOut, ForecastOut, AIAnswerOut, AIStatusOut
import server
import httpx


@pytest.fixture(autouse=True)
def setup_mock_db(monkeypatch):
    mock_client = AsyncMongoMockClient()
    mock_db = mock_client["brightloop_test"]
    import lib.db
    import lib.billing
    import lib.auth
    import lib.numbering
    import routers.reports
    import routers.ai

    monkeypatch.setattr(lib.db, "client", mock_client)
    monkeypatch.setattr(lib.db, "db", mock_db)
    monkeypatch.setattr(lib.billing, "db", mock_db)
    monkeypatch.setattr(lib.auth, "db", mock_db)
    monkeypatch.setattr(lib.numbering, "db", mock_db)
    monkeypatch.setattr(routers.reports, "db", mock_db)
    monkeypatch.setattr(routers.ai, "db", mock_db)
    return mock_db


def test_money_mrr_normalization():
    # Yearly: $1200/yr (120000 cents) -> $100/mo (10000 cents)
    assert normalized_monthly_cents(120000, "yearly") == 10000
    # Monthly: $149/mo (14900 cents) -> $149/mo (14900 cents)
    assert normalized_monthly_cents(14900, "monthly") == 14900
    # Weekly: $19/wk (1900 cents) -> 1900 * 52 / 12 = 8233 cents (~$82.33/mo)
    assert normalized_monthly_cents(1900, "weekly") == 8233
    # Daily: $5/day (500 cents) -> 500 * 30 = 15000 cents ($150.00/mo)
    assert normalized_monthly_cents(500, "daily") == 15000


def test_reports_date_range_resilience():
    # Normal range
    frm, to = _range("2026-01-01", "2026-06-30")
    assert frm == date(2026, 1, 1)
    assert to == date(2026, 6, 30)

    # Inverted dates should auto-swap so frm <= to
    frm_inv, to_inv = _range("2026-12-31", "2026-01-01")
    assert frm_inv == date(2026, 1, 1)
    assert to_inv == date(2026, 12, 31)

    # Empty string or None should use safe defaults without crashing
    frm_def, to_def = _range("", "")
    assert isinstance(frm_def, date)
    assert isinstance(to_def, date)
    assert frm_def <= to_def


@pytest.mark.asyncio
async def test_ai_provider_detection_and_precedence(monkeypatch):
    # 1. Unconfigured state
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    assert not _configured()
    assert _active_provider() == (None, None, None)

    # 2. OpenAI configured
    monkeypatch.setenv("OPENAI_API_KEY", "sk-mock-key")
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    assert _configured()
    provider, key, model = _active_provider()
    assert provider == "openai"
    assert key == "sk-mock-key"
    assert model == "gpt-4o-mini"

    # 3. Gemini configured
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "AIzaSy-mock-key")
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    assert _configured()
    provider, key, model = _active_provider()
    assert provider == "gemini"
    assert key == "AIzaSy-mock-key"
    assert model == "gemini-2.5-flash"

    # 4. Explicit AI_PROVIDER override
    monkeypatch.setenv("OPENAI_API_KEY", "sk-mock-key")
    monkeypatch.setenv("GEMINI_API_KEY", "AIzaSy-mock-key")
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    provider, key, model = _active_provider()
    assert provider == "gemini"

    monkeypatch.setenv("AI_PROVIDER", "openai")
    provider, key, model = _active_provider()
    assert provider == "openai"


@pytest.mark.asyncio
async def test_ai_context_grounding_and_isolation():
    # Seed plans
    await db_mod.db.plans.insert_many([
        {"id": "plan-growth", "name": "Loop Growth", "billing_period": "monthly", "price_cents": 14900, "active": True},
        {"id": "plan-starter", "name": "Loop Starter", "billing_period": "monthly", "price_cents": 4900, "active": True},
    ])

    # Seed subscriptions: Customer 1 has Growth, Customer 2 has Starter
    await db_mod.db.subscriptions.insert_many([
        {
            "id": "sub-1", "customer_id": "cust-1", "plan_id": "plan-growth", "status": "active",
            "quantity": 1, "unit_price_cents": 14900, "billing_period": "monthly", "paused": False,
        },
        {
            "id": "sub-2", "customer_id": "cust-2", "plan_id": "plan-starter", "status": "active",
            "quantity": 1, "unit_price_cents": 4900, "billing_period": "monthly", "paused": False,
        },
    ])

    # Seed invoices
    await db_mod.db.invoices.insert_many([
        {
            "id": "inv-1", "number": "INV-001", "customer_id": "cust-1", "status": "confirmed",
            "total_cents": 14900, "amount_paid_cents": 0, "due_date": "2026-10-15", "created_at": "2026-10-01",
        },
        {
            "id": "inv-2", "number": "INV-002", "customer_id": "cust-2", "status": "confirmed",
            "total_cents": 4900, "amount_paid_cents": 0, "due_date": "2026-10-20", "created_at": "2026-10-01",
        },
    ])

    # Seed payments
    await db_mod.db.payments.insert_many([
        {"id": "pay-1", "number": "PAY-001", "customer_id": "cust-1", "amount_cents": 14900, "paid_at": "2026-10-01", "method": "card"},
        {"id": "pay-2", "number": "PAY-002", "customer_id": "cust-2", "amount_cents": 4900, "paid_at": "2026-10-01", "method": "cash"},
    ])

    admin = Principal({"id": "u-admin", "email": "admin@bl.io", "role": "ADMIN", "customer_id": None})
    cust1 = Principal({"id": "u-c1", "email": "c1@bl.io", "role": "CUSTOMER", "customer_id": "cust-1"})

    # 1. Admin Context: Sees company totals
    admin_ctx = await _context(admin)
    assert admin_ctx["active_subscriptions"] == 2
    assert admin_ctx["mrr"] == "$198.00"  # 149 + 49
    assert admin_ctx["arr"] == "$2,376.00"
    assert admin_ctx["overdue_invoices_count"] == 2
    assert admin_ctx["overdue_total_balance"] == "$198.00"
    assert len(admin_ctx["plans"]) == 2
    # Plans ranked by revenue
    assert admin_ctx["plans"][0]["name"] == "Loop Growth"
    assert admin_ctx["plans"][0]["monthly_revenue"] == "$149.00"

    # 2. Customer 1 Context: Strictly scoped to cust-1
    c1_ctx = await _context(cust1)
    assert c1_ctx["active_subscriptions"] == 1
    assert c1_ctx["mrr"] == "$149.00"
    assert c1_ctx["arr"] == "$1,788.00"
    assert c1_ctx["overdue_invoices_count"] == 1
    assert c1_ctx["overdue_total_balance"] == "$149.00"
    assert len(c1_ctx["open_invoices"]) == 1
    assert c1_ctx["open_invoices"][0]["number"] == "INV-001"
    assert len(c1_ctx["recent_payments"]) == 1
    assert c1_ctx["recent_payments"][0]["number"] == "PAY-001"
    # Never expose cust-2 records
    assert not any(i["number"] == "INV-002" for i in c1_ctx["open_invoices"])
    assert not any(p["number"] == "PAY-002" for p in c1_ctx["recent_payments"])


@pytest.mark.asyncio
async def test_ai_unconfigured_response(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    from routers.ai import assistant
    from models.system import AIAskIn

    admin = Principal({"id": "u-admin", "email": "admin@bl.io", "role": "ADMIN", "customer_id": None})
    res = await assistant(AIAskIn(question="What is our MRR?"), admin)

    assert not res.configured
    assert res.answer is None
    assert "not configured" in res.error.lower()
    assert "OPENAI_API_KEY" in res.error
    assert "GEMINI_API_KEY" in res.error

