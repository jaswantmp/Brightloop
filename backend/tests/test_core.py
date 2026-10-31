import sys
from pathlib import Path
BACKEND_DIR = str(Path(__file__).resolve().parent.parent)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import pytest
import asyncio
from datetime import date, datetime, timezone
from mongomock_motor import AsyncMongoMockClient

import lib.db as db_mod
import server
from lib.security import hash_password, verify_password, validate_password
from lib.billing import (
    add_periods,
    period_end,
    new_subscription_doc,
    generate_due_invoices,
    close_subscription,
)
from lib.dates import today_iso
from lib.money import tax_cents, discount_cents
from starlette.testclient import TestClient

@pytest.fixture(autouse=True)
def setup_mock_db(monkeypatch):
    mock_client = AsyncMongoMockClient()
    mock_db = mock_client["brightloop_test"]
    import lib.db
    import lib.billing
    import lib.auth
    import lib.numbering
    monkeypatch.setattr(lib.db, "client", mock_client)
    monkeypatch.setattr(lib.db, "db", mock_db)
    monkeypatch.setattr(lib.billing, "db", mock_db)
    monkeypatch.setattr(lib.auth, "db", mock_db)
    monkeypatch.setattr(lib.numbering, "db", mock_db)
    return mock_db

def test_password_security():
    # Passwords must meet policy
    assert validate_password("weak") is not None
    assert validate_password("ValidPassword1@") is None
    hashed = hash_password("Secret123!")
    assert verify_password("Secret123!", hashed)
    assert not verify_password("WrongPass", hashed)

def test_financial_calculations():
    # Tax: 10% (1000 bps) on $50.00 (5000 cents) = 500 cents
    assert tax_cents(5000, 1000) == 500
    # Discount: 20% (2000 bps) on $100.00 (10000 cents) = 2000 cents
    assert discount_cents(10000, "percentage", 2000) == 2000
    # Fixed discount: $15.00 (1500 cents)
    assert discount_cents(10000, "fixed", 1500) == 1500
    # Fixed discount cannot exceed subtotal
    assert discount_cents(1000, "fixed", 1500) == 1000

def test_period_math():
    start = date(2026, 1, 15)
    assert add_periods(start, "monthly", 1) == date(2026, 2, 15)
    assert add_periods(start, "yearly", 1) == date(2027, 1, 15)
    assert add_periods(start, "daily", 7) == date(2026, 1, 22)
    assert period_end(start, "monthly") == date(2026, 2, 14)

@pytest.mark.asyncio
async def test_subscription_creation_and_lifecycle():
    plan = {
        "id": "plan-123",
        "name": "Loop Growth",
        "price_cents": 4900,
        "billing_period": "monthly",
        "tax_id": None,
    }
    # Create subscription doc
    sub = await new_subscription_doc(
        customer_id="cust-1",
        plan=plan,
        quantity=2,
        start_date="2026-01-01",
        payment_terms_days=30,
        discount_id=None,
        created_by="user-admin",
        status="active",
    )
    assert sub["customer_id"] == "cust-1"
    assert sub["unit_price_cents"] == 4900
    assert sub["quantity"] == 2
    assert sub["status"] == "active"
    assert sub["number"].startswith("SUB-")

    # Insert into mock db
    await db_mod.db.subscriptions.insert_one(sub)
    saved = await db_mod.db.subscriptions.find_one({"id": sub["id"]})
    assert saved is not None

    # Close subscription
    await close_subscription(sub, None, "Cancellation requested")
    updated = await db_mod.db.subscriptions.find_one({"id": sub["id"]})
    assert updated["status"] == "closed"
    assert updated["close_reason"] == "Cancellation requested"

@pytest.mark.asyncio
async def test_duplicate_invoice_prevention():
    today = today_iso()
    plan = {
        "id": "plan-pro",
        "name": "Pro Plan",
        "price_cents": 10000,
        "billing_period": "monthly",
        "tax_id": None,
    }
    await db_mod.db.plans.insert_one(plan)
    sub = await new_subscription_doc(
        customer_id="cust-dup",
        plan=plan,
        quantity=1,
        start_date="2026-01-01",
        payment_terms_days=30,
        discount_id=None,
        created_by="admin",
        status="active",
    )
    sub["next_billing_date"] = "2026-01-01"
    await db_mod.db.subscriptions.insert_one(sub)

    # First billing run: creates invoices up to today
    res1 = await generate_due_invoices()
    assert res1["invoices_created"] > 0

    # Second billing run on the same day: skips duplicate period!
    res2 = await generate_due_invoices()
    assert res2["invoices_created"] == 0
    assert res2["already_billed_skipped"] == 0  # next_billing_date was advanced past today


@pytest.mark.asyncio
async def test_role_permissions_and_scoping():
    from lib.auth import Principal, customer_filter, load_scoped
    from fastapi import HTTPException

    admin = Principal({"id": "u1", "email": "admin@bl.io", "role": "ADMIN", "customer_id": None})
    staff = Principal({"id": "u2", "email": "staff@bl.io", "role": "STAFF", "customer_id": None})
    cust1 = Principal({"id": "u3", "email": "sara@novatek.io", "role": "CUSTOMER", "customer_id": "c1"})

    # Admin and staff see all (empty filter) or can specify customer_id
    assert customer_filter(admin) == {}
    assert customer_filter(staff) == {}
    assert customer_filter(admin, "c1") == {"customer_id": "c1"}

    # Customer is strictly pinned to own customer_id
    assert customer_filter(cust1) == {"customer_id": "c1"}

    # Customer requesting another customer's id gets 404 (denial of existence)
    with pytest.raises(HTTPException) as exc_info:
        customer_filter(cust1, "c2")
    assert exc_info.value.status_code == 404

    # Seed an invoice for c2
    await db_mod.db.invoices.insert_one({"id": "inv-secret", "customer_id": "c2", "total_cents": 5000})

    # Cust1 trying to load c2's invoice gets 404
    with pytest.raises(HTTPException) as exc_info:
        await load_scoped(cust1, "invoices", "inv-secret")
    assert exc_info.value.status_code == 404

    # Admin and Staff can load c2's invoice
    doc = await load_scoped(admin, "invoices", "inv-secret")
    assert doc["id"] == "inv-secret"


@pytest.mark.asyncio
async def test_payment_recording_and_validation(monkeypatch):
    import routers.payments as payments_mod
    monkeypatch.setattr(payments_mod, "db", db_mod.db)
    from models.billing import PaymentIn
    from lib.auth import Principal
    from fastapi import HTTPException

    staff = Principal({"id": "u-staff", "email": "staff@bl.io", "role": "STAFF", "customer_id": None})

    # Create confirmed invoice with total $100.00
    inv = {
        "id": "inv-pay-1",
        "number": "INV-1001",
        "customer_id": "c1",
        "status": "confirmed",
        "total_cents": 10000,
        "amount_paid_cents": 0,
    }
    await db_mod.db.invoices.insert_one(inv)

    # 1. Partial payment: $40.00
    pay_in = PaymentIn(invoice_id="inv-pay-1", amount_cents=4000, method="card")
    res1 = await payments_mod.record_payment(pay_in, staff)
    assert res1["amount_cents"] == 4000

    inv_after1 = await db_mod.db.invoices.find_one({"id": "inv-pay-1"})
    assert inv_after1["amount_paid_cents"] == 4000
    assert inv_after1["status"] == "confirmed"

    # 2. Overpayment attempt: $70.00 (remaining balance is only $60.00) -> should be rejected!
    pay_excess = PaymentIn(invoice_id="inv-pay-1", amount_cents=7000, method="card")
    with pytest.raises(HTTPException) as exc_info:
        await payments_mod.record_payment(pay_excess, staff)
    assert exc_info.value.status_code == 400

    # 3. Final payment: $60.00 -> marks invoice as paid
    pay_final = PaymentIn(invoice_id="inv-pay-1", amount_cents=6000, method="card")
    await payments_mod.record_payment(pay_final, staff)

    inv_after2 = await db_mod.db.invoices.find_one({"id": "inv-pay-1"})
    assert inv_after2["amount_paid_cents"] == 10000
    assert inv_after2["status"] == "paid"

