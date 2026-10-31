"""Seed Brightloop with clearly-labeled demo data (~13 months of history).

Run:  cd /app/backend && python seed.py            # seeds only when empty
      cd /app/backend && python seed.py --reset    # drops app data and reseeds

Every seeded document carries is_demo=True so the UI/reporting can label demo
data honestly. Idempotent by default; --reset wipes collections first (and
recreates indexes afterwards, since drop discards them).
"""
import asyncio
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from lib.billing import add_periods, period_end, schedule_reminders, new_subscription_doc
from lib.db import client, db, ensure_indexes
from lib.dates import today_iso
from lib.money import tax_cents, discount_cents
from lib.numbering import next_number
from lib.security import hash_password

random.seed(11)

COLLECTIONS = [
    "users", "sessions", "password_resets", "customers", "products",
    "product_variants", "plans", "taxes", "discounts", "quotations",
    "quotation_templates", "subscriptions", "invoices", "payments",
    "reminders", "change_requests", "audit_logs", "settings", "counters",
    "status_checks",
]

now_iso = datetime.now(timezone.utc).isoformat()


async def reset() -> None:
    for c in COLLECTIONS:
        await db[c].delete_many({})


def months_ago(n: int, day: int = 1) -> str:
    d = date.fromisoformat(today_iso())
    total = d.month - 1 - n
    year = d.year + total // 12
    month = total % 12 + 1
    return date(year, month, min(day, 28)).isoformat()


def in_days(n: int) -> str:
    return (date.fromisoformat(today_iso()) + timedelta(days=n)).isoformat()


async def seed() -> None:
    # --- users -------------------------------------------------------------
    admin = {
        "id": str(uuid.uuid4()), "email": "admin@brightloop.io",
        "name": "Ada Grant", "role": "ADMIN", "customer_id": None,
        "password_hash": hash_password("Bright@Loop1"), "status": "active",
        "created_at": months_ago(13),
    }
    staff = {
        "id": str(uuid.uuid4()), "email": "staff@brightloop.io",
        "name": "Marco Voss", "role": "STAFF", "customer_id": None,
        "password_hash": hash_password("Staff@Loop1"), "status": "active",
        "created_at": months_ago(12),
    }
    staff2 = {
        "id": str(uuid.uuid4()), "email": "priya@brightloop.io",
        "name": "Priya Nair", "role": "STAFF", "customer_id": None,
        "password_hash": hash_password("Staff@Loop2"), "status": "active",
        "created_at": months_ago(9),
    }
    old_staff = {
        "id": str(uuid.uuid4()), "email": "old.staff@brightloop.io",
        "name": "Tom Askew", "role": "STAFF", "customer_id": None,
        "password_hash": hash_password("Staff@Old1"), "status": "disabled",
        "created_at": months_ago(11),
    }
    await db.users.insert_many([admin, staff, staff2, old_staff])

    # --- taxes -------------------------------------------------------------
    tax_vat = {"id": str(uuid.uuid4()), "name": "VAT Standard", "rate_bps": 850, "is_default": True}
    tax_red = {"id": str(uuid.uuid4()), "name": "VAT Reduced", "rate_bps": 500, "is_default": False}
    tax_zero = {"id": str(uuid.uuid4()), "name": "Tax Exempt", "rate_bps": 0, "is_default": False}
    await db.taxes.insert_many([tax_vat, tax_red, tax_zero])

    # --- plans ---------------------------------------------------------------
    plan_specs = [
        ("Loop Starter", "For small teams getting started", "monthly", 4900, 1, tax_vat["id"]),
        ("Loop Growth", "Growing teams with advanced needs", "monthly", 14900, 1, tax_vat["id"]),
        ("Loop Scale", "High-volume operations", "monthly", 39900, 1, tax_vat["id"]),
        ("Loop Enterprise", "Annual enterprise agreement", "yearly", 399000, 1, tax_vat["id"]),
        ("Loop Weekly Desk", "Shared desk billed weekly", "weekly", 1900, 5, tax_red["id"]),
        ("Loop Day Pass", "Per-day access for events", "daily", 500, 10, tax_red["id"]),
    ]
    plans = {}
    for name, desc, period, price, minq, tax_id in plan_specs:
        doc = {
            "id": str(uuid.uuid4()), "name": name, "description": desc,
            "billing_period": period, "price_cents": price, "min_quantity": minq,
            "available_from": months_ago(13), "available_to": in_days(365),
            "auto_close": True, "allow_pause": name != "Loop Day Pass",
            "allow_renewal": True, "allow_early_close": name != "Loop Enterprise",
            "tax_id": tax_id, "active": True, "created_at": months_ago(13),
        }
        plans[name] = doc
    await db.plans.insert_many(list(plans.values()))

    # --- products & variants ---------------------------------------------------
    product_specs = [
        ("Onboarding Kit", "product", 19900, 8500, "Physical welcome kit shipped to new customers"),
        ("Hardware Sensor Node", "product", 24900, 11200, "IoT sensor for environment monitoring"),
        ("Analytics Add-on Module", "service", 9900, 2400, "Advanced analytics module"),
        ("Priority Support Retainer", "service", 14900, 3900, "Priority support with 2h SLA"),
        ("Brand Asset Bundle", "product", 7900, 2100, "Design assets and templates"),
        ("Integration Setup", "service", 34900, 12000, "Custom integration implementation"),
        ("Data Migration Service", "service", 49900, 18000, "Legacy data migration"),
        ("Marketing Landing Pack", "product", 12900, 4300, "Landing page design pack"),
    ]
    products = {}
    variants = []
    for name, ptype, sales, cost, notes in product_specs:
        pid = str(uuid.uuid4())
        products[name] = {
            "id": pid, "name": name, "type": ptype, "sales_price_cents": sales,
            "cost_price_cents": cost, "notes": notes, "tax_id": tax_vat["id"],
            "active": True, "created_at": months_ago(12),
        }
        if name == "Onboarding Kit":
            variants += [
                {"id": str(uuid.uuid4()), "product_id": pid, "name": "Standard", "adjustment_type": "fixed", "adjustment_value": 0},
                {"id": str(uuid.uuid4()), "product_id": pid, "name": "With Training", "adjustment_type": "fixed", "adjustment_value": 15000},
                {"id": str(uuid.uuid4()), "product_id": pid, "name": "Digital-only", "adjustment_type": "fixed", "adjustment_value": -5000},
            ]
        if name == "Hardware Sensor Node":
            variants += [
                {"id": str(uuid.uuid4()), "product_id": pid, "name": "Indoor", "adjustment_type": "fixed", "adjustment_value": 0},
                {"id": str(uuid.uuid4()), "product_id": pid, "name": "Outdoor rated", "adjustment_type": "percentage", "adjustment_value": 3200},
            ]
        if name == "Analytics Add-on Module":
            variants += [
                {"id": str(uuid.uuid4()), "product_id": pid, "name": "Basic", "adjustment_type": "fixed", "adjustment_value": 0},
                {"id": str(uuid.uuid4()), "product_id": pid, "name": "Pro", "adjustment_type": "fixed", "adjustment_value": 5000},
            ]
    await db.products.insert_many(list(products.values()))
    if variants:
        await db.product_variants.insert_many(variants)

    # --- discounts --------------------------------------------------------------
    discounts = {
        "WELCOME10": {"id": str(uuid.uuid4()), "name": "WELCOME10", "type": "percentage", "value": 1000, "min_purchase_cents": 0, "min_quantity": 0, "start_date": None, "end_date": None, "usage_limit": 100, "used_count": 0, "created_at": months_ago(12)},
        "Q4SAVE50": {"id": str(uuid.uuid4()), "name": "Q4SAVE50", "type": "fixed", "value": 5000, "min_purchase_cents": 20000, "min_quantity": 0, "start_date": months_ago(6), "end_date": in_days(60), "usage_limit": 50, "used_count": 0, "created_at": months_ago(6)},
        "VOLUME15": {"id": str(uuid.uuid4()), "name": "VOLUME15", "type": "percentage", "value": 1500, "min_purchase_cents": 0, "min_quantity": 5, "start_date": None, "end_date": None, "usage_limit": None, "used_count": 0, "created_at": months_ago(8)},
        "LOYAL5": {"id": str(uuid.uuid4()), "name": "LOYAL5", "type": "percentage", "value": 500, "min_purchase_cents": 0, "min_quantity": 0, "start_date": None, "end_date": None, "usage_limit": None, "used_count": 0, "created_at": months_ago(10)},
    }
    await db.discounts.insert_many(list(discounts.values()))

    # --- customers ------------------------------------------------------------
    companies = [
        ("NovaTek Labs", "Sara Chen", "sara@novatek.io"),
        ("Harbor Analytics", "Jules Ferrer", "jules@harboranalytics.com"),
        ("Cobalt Studio", "Mina Reyes", "mina@cobaltstudio.design"),
        ("Fernwood Health", "Owen Blake", "owen@fernwoodhealth.com"),
        ("Statlight", "Ines Kaur", "ines@statlight.io"),
        ("Bluecrest Legal", "Theo Marsh", "theo@bluecrestlegal.com"),
        ("Kite & Crew", "Lena Fox", "lena@kiteandcrew.co"),
        ("Marlow Logistics", "Ravi Patel", "ravi@marlowlogistics.com"),
        ("Quill Systems", "Ada Lin", "ada@quillsystems.dev"),
        ("Bramble Foods", "Noor Haddad", "noor@bramblefoods.com"),
        ("Vector Retail", "Sam Ortiz", "sam@vectorretail.com"),
        ("Lumen Yoga", "Iris Novak", "iris@lumenyoga.studio"),
        ("Pinecloud Software", "Eli Ward", "eli@pinecloud.dev"),
        ("Atlas Field Services", "Maya Dunn", "maya@atlasfield.com"),
        ("Cirrus Media", "Jonas Berg", "jonas@cirrusmedia.tv"),
        ("Redwood Clinics", "Tara Singh", "tara@redwoodclinics.com"),
        ("FoundryWorks", "Cole Adams", "cole@foundryworks.io"),
        ("Sable Accounting", "Vera Moss", "vera@sableaccounting.com"),
        ("Driftline Travel", "Kai Mendes", "kai@driftline.travel"),
        ("Halcyon Fitness", "Rosa Vidal", "rosa@halcyon.fitness"),
        ("Tessellate Design", "Anya Petrov", "anya@tessellate.design"),
        ("Grove Analytics", "Femi Ade", "femi@groveanalytics.io"),
        ("Northstar Tutoring", "Elif Demir", "elif@northstar.tutoring"),
        ("Verge Robotics", "Hugo Lam", "hugo@vergerobotics.com"),
    ]
    customers = []
    for i, (company, contact, email) in enumerate(companies):
        customers.append({
            "id": str(uuid.uuid4()), "name": contact, "company": company, "email": email,
            "phone": f"+1 555 0{i:03d}", "billing_address": f"{100 + i} Market Street, Springfield",
            "notes": "Seeded demo customer", "status": "archived" if i == 23 else "active",
            "created_at": months_ago(12 - (i % 12)), "is_demo": True,
        })
    await db.customers.insert_many(customers)
    cust_by_company = {c["company"]: c for c in customers}

    sara_user = {
        "id": str(uuid.uuid4()), "email": "sara@novatek.io",
        "name": "Sara Chen", "role": "CUSTOMER",
        "customer_id": cust_by_company["NovaTek Labs"]["id"],
        "password_hash": hash_password("Customer@1"), "status": "active",
        "created_at": months_ago(7),
    }
    await db.users.insert_one(sara_user)

    # --- subscriptions + billing history ----------------------------------------
    today = date.fromisoformat(today_iso())
    demo_user_id = admin["id"]

    scenarios = [
        # (customer, plan, qty, months_ago_start, fate)
        ("Harbor Analytics", "Loop Growth", 1, 11, "active"),
        ("Cobalt Studio", "Loop Starter", 2, 10, "active"),
        ("Fernwood Health", "Loop Scale", 1, 9, "active"),
        ("Statlight", "Loop Growth", 3, 7, "active"),
        ("Bluecrest Legal", "Loop Starter", 1, 7, "active"),
        ("Kite & Crew", "Loop Scale", 1, 6, "active"),
        ("Marlow Logistics", "Loop Weekly Desk", 6, 8, "active"),
        ("Quill Systems", "Loop Enterprise", 1, 8, "active"),
        ("Bramble Foods", "Loop Starter", 1, 2, "active"),
        ("Vector Retail", "Loop Growth", 1, 1, "active"),
        ("Lumen Yoga", "Loop Weekly Desk", 8, 2, "paused"),
        ("FoundryWorks", "Loop Growth", 1, 9, "closed"),
        ("Sara Chen's NovaTek", "Loop Growth", 1, 6, "active"),  # NovaTek — portal demo
    ]
    sub_docs = []
    for company, plan_name, qty, m_ago, fate in scenarios:
        customer = cust_by_company["NovaTek Labs"] if company.startswith("Sara") else cust_by_company[company]
        plan = plans[plan_name]
        start = months_ago(m_ago, day=3)
        sub = await new_subscription_doc(
            customer_id=customer["id"], plan=plan, quantity=qty, start_date=start,
            payment_terms_days=30, discount_id=None, created_by=demo_user_id, status="active",
            is_demo=True,
        )
        sub["created_at"] = start
        if fate == "paused":
            sub["paused"] = True
        if fate == "closed":
            closed_at = months_ago(3, day=20)
            sub["status"] = "closed"
            sub["closed_at"] = closed_at
            sub["close_reason"] = "Demo closure: migrated to competitor"
        sub_docs.append(sub)
    await db.subscriptions.insert_many(sub_docs)

    # Billing history: one invoice per period since start (or until close/pause)
    methods = ["card", "bank_transfer", "ach", "cash"]
    plan_by_id = {p["id"]: p for p in plans.values()}
    for sub in sub_docs:
        start = date.fromisoformat(sub["start_date"])
        stop = today
        if sub["status"] == "closed":
            stop = min(stop, date.fromisoformat(sub["closed_at"]))
        if sub.get("paused"):
            pause_month = (today - timedelta(days=35))
            stop = min(stop, pause_month)
        ps = start
        invs_for_sub: list[tuple[dict, bool, int]] = []  # (invoice, paid, paid_offset_days)
        period_index = 0
        while ps <= stop:
            pe = period_end(ps, sub["billing_period"])
            plan = plan_by_id[sub["plan_id"]]
            subtotal = sub["quantity"] * sub["unit_price_cents"]
            disc_id, disc = (None, 0)
            if period_index in (2, 5) and subtotal >= 10000:
                d = discounts["LOYAL5"] if subtotal < 20000 else discounts["Q4SAVE50"]
                disc_id = d["id"]
                await db.discounts.update_one({"id": d["id"]}, {"$inc": {"used_count": 1}})
                disc = discount_cents(subtotal, d["type"], d["value"])
            taxable = subtotal - disc
            tax = tax_cents(taxable, sub["tax_bps"])
            due = pe + timedelta(days=sub["payment_terms_days"])
            # Decide payment state deterministically by age
            fully_paid, partial_pct, offset = True, 0, random.randint(2, 12)
            if pe >= today - timedelta(days=50):
                fully_paid = False  # recent periods left open (some overdue)
                if pe < today - timedelta(days=35):
                    partial_pct = random.choice([40, 60])
            if pe >= stop - timedelta(days=5) and sub["status"] == "active" and not sub.get("paused"):
                fully_paid = False  # current period always open
            total = taxable + tax
            paid = 0
            if fully_paid:
                paid = total
            elif partial_pct:
                paid = total * partial_pct // 100
            inv = {
                "id": str(uuid.uuid4()),
                "number": await next_number("INV-"),
                "customer_id": sub["customer_id"],
                "subscription_id": sub["id"],
                "period_start": ps.isoformat(),
                "period_end": pe.isoformat(),
                "status": "confirmed",
                "issue_date": ps.isoformat(),
                "due_date": due.isoformat(),
                "lines": [{
                    "description": f"{plan['name']} — {ps.isoformat()} to {pe.isoformat()}",
                    "quantity": sub["quantity"], "unit_price_cents": sub["unit_price_cents"],
                    "discount_cents": disc, "tax_bps": sub["tax_bps"], "tax_cents": tax,
                    "line_total_cents": total,
                }],
                "subtotal_cents": subtotal, "discount_cents": disc, "tax_cents": tax,
                "total_cents": total, "amount_paid_cents": paid,
                "notes": f"Recurring billing ({sub['billing_period']})",
                "created_by": demo_user_id, "created_at": ps.isoformat(),
                "is_demo": True, "discount_id": disc_id,
            }
            await db.invoices.insert_one(inv)
            if paid > 0:
                payment = {
                    "id": str(uuid.uuid4()),
                    "number": await next_number("PAY-"),
                    "invoice_id": inv["id"], "customer_id": sub["customer_id"],
                    "amount_cents": paid, "method": random.choice(methods),
                    "paid_at": min(due.isoformat(), today_iso()),
                    "note": "Seeded demo payment", "created_by": demo_user_id,
                    "created_at": min(due.isoformat(), today_iso()),
                    "is_demo": True,
                }
                await db.payments.insert_one(payment)
                invs_for_sub.append((inv, True, 0))
            period_index += 1
            ps = add_periods(ps, sub["billing_period"])
        # advance next_billing_date past today for still-active subs
        if sub["status"] == "active" and not sub.get("paused"):
            nxt = ps
            while nxt <= today:
                nxt = add_periods(nxt, sub["billing_period"])
            await db.subscriptions.update_one(
                {"id": sub["id"]}, {"$set": {"next_billing_date": nxt.isoformat()}}
            )

    # Lifecycle demo rows (no history): draft, quotation-linked, confirmed-future
    draft_cust = cust_by_company["Atlas Field Services"]
    draft_sub = await new_subscription_doc(
        customer_id=draft_cust["id"], plan=plans["Loop Starter"], quantity=1,
        start_date=in_days(7), payment_terms_days=30, discount_id=None,
        created_by=staff["id"], status="draft", is_demo=True,
    )
    await db.subscriptions.insert_one(draft_sub)

    quote_sub = await new_subscription_doc(
        customer_id=cust_by_company["Cirrus Media"]["id"], plan=plans["Loop Scale"],
        quantity=1, start_date=in_days(5), payment_terms_days=30, discount_id=None,
        created_by=staff["id"], status="quotation", is_demo=True,
    )
    await db.subscriptions.insert_one(quote_sub)

    confirmed_sub = await new_subscription_doc(
        customer_id=cust_by_company["Redwood Clinics"]["id"], plan=plans["Loop Growth"],
        quantity=2, start_date=in_days(10), payment_terms_days=30, discount_id=None,
        created_by=staff["id"], status="confirmed", is_demo=True,
    )
    await db.subscriptions.insert_one(confirmed_sub)

    # --- quotations & templates ------------------------------------------------
    qt_accepted = {
        "id": str(uuid.uuid4()), "number": await next_number("QT-"),
        "customer_id": cust_by_company["Cirrus Media"]["id"], "status": "sent",
        "issue_date": months_ago(1, 15), "valid_until": in_days(14),
        "lines": [{
            "description": "Loop Scale", "quantity": 1,
            "unit_price_cents": plans["Loop Scale"]["price_cents"], "discount_cents": 0,
            "tax_bps": tax_vat["rate_bps"],
            "tax_cents": tax_cents(plans["Loop Scale"]["price_cents"], tax_vat["rate_bps"]),
            "line_total_cents": plans["Loop Scale"]["price_cents"] + tax_cents(plans["Loop Scale"]["price_cents"], tax_vat["rate_bps"]),
        }],
        "source_lines": [{"kind": "plan", "ref_id": plans["Loop Scale"]["id"], "variant_id": None, "quantity": 1, "discount_id": None}],
        "subtotal_cents": plans["Loop Scale"]["price_cents"], "discount_cents": 0,
        "tax_cents": tax_cents(plans["Loop Scale"]["price_cents"], tax_vat["rate_bps"]),
        "total_cents": plans["Loop Scale"]["price_cents"] + tax_cents(plans["Loop Scale"]["price_cents"], tax_vat["rate_bps"]),
        "notes": "Sent to customer, awaiting decision", "subscription_ids": [quote_sub["id"]],
        "created_by": staff["id"], "created_at": months_ago(1, 15), "is_demo": True,
    }
    qt_pending = {
        "id": str(uuid.uuid4()), "number": await next_number("QT-"),
        "customer_id": cust_by_company["Tessellate Design"]["id"], "status": "draft",
        "issue_date": today_iso(), "valid_until": in_days(30),
        "lines": [{
            "description": "Onboarding Kit — With Training", "quantity": 2,
            "unit_price_cents": products["Onboarding Kit"]["sales_price_cents"] + 15000,
            "discount_cents": 0, "tax_bps": tax_vat["rate_bps"],
            "tax_cents": tax_cents(2 * (products["Onboarding Kit"]["sales_price_cents"] + 15000), tax_vat["rate_bps"]),
            "line_total_cents": 2 * (products["Onboarding Kit"]["sales_price_cents"] + 15000) + tax_cents(2 * (products["Onboarding Kit"]["sales_price_cents"] + 15000), tax_vat["rate_bps"]),
        }],
        "source_lines": [{"kind": "product", "ref_id": products["Onboarding Kit"]["id"], "variant_id": variants[1]["id"], "quantity": 2, "discount_id": None}],
        "subtotal_cents": 2 * (products["Onboarding Kit"]["sales_price_cents"] + 15000),
        "discount_cents": 0,
        "tax_cents": tax_cents(2 * (products["Onboarding Kit"]["sales_price_cents"] + 15000), tax_vat["rate_bps"]),
        "total_cents": 2 * (products["Onboarding Kit"]["sales_price_cents"] + 15000) + tax_cents(2 * (products["Onboarding Kit"]["sales_price_cents"] + 15000), tax_vat["rate_bps"]),
        "notes": "Includes onboarding training", "subscription_ids": [],
        "created_by": staff["id"], "created_at": today_iso(), "is_demo": True,
    }
    qt_rejected = {
        "id": str(uuid.uuid4()), "number": await next_number("QT-"),
        "customer_id": cust_by_company["Grove Analytics"]["id"], "status": "rejected",
        "issue_date": months_ago(2, 10), "valid_until": months_ago(1, 10),
        "lines": [{
            "description": "Integration Setup", "quantity": 1,
            "unit_price_cents": products["Integration Setup"]["sales_price_cents"],
            "discount_cents": 0, "tax_bps": tax_vat["rate_bps"],
            "tax_cents": tax_cents(products["Integration Setup"]["sales_price_cents"], tax_vat["rate_bps"]),
            "line_total_cents": products["Integration Setup"]["sales_price_cents"] + tax_cents(products["Integration Setup"]["sales_price_cents"], tax_vat["rate_bps"]),
        }],
        "source_lines": [{"kind": "product", "ref_id": products["Integration Setup"]["id"], "variant_id": None, "quantity": 1, "discount_id": None}],
        "subtotal_cents": products["Integration Setup"]["sales_price_cents"], "discount_cents": 0,
        "tax_cents": tax_cents(products["Integration Setup"]["sales_price_cents"], tax_vat["rate_bps"]),
        "total_cents": products["Integration Setup"]["sales_price_cents"] + tax_cents(products["Integration Setup"]["sales_price_cents"], tax_vat["rate_bps"]),
        "notes": "Rejected: budget cycle", "subscription_ids": [],
        "created_by": staff2["id"], "created_at": months_ago(2, 10), "is_demo": True,
    }
    await db.quotations.insert_many([qt_accepted, qt_pending, qt_rejected])

    await db.quotation_templates.insert_many([
        {
            "id": str(uuid.uuid4()), "name": "SaaS Onboarding Bundle",
            "description": "Starter kit + priority support for new SaaS customers",
            "lines": [
                {"kind": "product", "ref_id": products["Onboarding Kit"]["id"], "variant_id": variants[1]["id"], "quantity": 1, "discount_id": discounts["WELCOME10"]["id"]},
                {"kind": "product", "ref_id": products["Priority Support Retainer"]["id"], "variant_id": None, "quantity": 1, "discount_id": None},
            ],
            "created_at": months_ago(5), "created_by": staff["id"],
        },
        {
            "id": str(uuid.uuid4()), "name": "Enterprise Annual",
            "description": "Annual enterprise agreement with migration",
            "lines": [
                {"kind": "plan", "ref_id": plans["Loop Enterprise"]["id"], "variant_id": None, "quantity": 1, "discount_id": discounts["VOLUME15"]["id"]},
                {"kind": "product", "ref_id": products["Data Migration Service"]["id"], "variant_id": None, "quantity": 1, "discount_id": None},
            ],
            "created_at": months_ago(4), "created_by": staff2["id"],
        },
    ])

    # --- change requests ----------------------------------------------------
    sara_sub = next(s for s in sub_docs if s["customer_id"] == cust_by_company["NovaTek Labs"]["id"])
    await db.change_requests.insert_many([
        {
            "id": str(uuid.uuid4()), "subscription_id": sara_sub["id"],
            "customer_id": sara_sub["customer_id"], "type": "quantity_change",
            "details": "We hired two more analysts — please bump seats to 2.",
            "quantity_new": 2, "status": "pending", "created_at": in_days(-2),
            "decided_at": None, "decided_by": None,
        },
        {
            "id": str(uuid.uuid4()), "subscription_id": sara_sub["id"],
            "customer_id": sara_sub["customer_id"], "type": "pause",
            "details": "Considering a pause over the holidays.",
            "quantity_new": None, "status": "pending", "created_at": in_days(-1),
            "decided_at": None, "decided_by": None,
        },
        {
            "id": str(uuid.uuid4()), "subscription_id": sub_docs[1]["id"],
            "customer_id": sub_docs[1]["customer_id"], "type": "renew",
            "details": "Renewed for another term.",
            "quantity_new": None, "status": "approved", "created_at": months_ago(1, 8),
            "decided_at": months_ago(1, 9), "decided_by": "admin@brightloop.io",
        },
    ])

    # --- settings & audit -----------------------------------------------------
    await db.settings.insert_one({
        "id": "app", "company_name": "Brightloop Inc.", "currency": "USD",
        "default_payment_terms_days": 30,
        "invoice_terms": "Payment due within the stated terms. Late payments enter the recovery schedule.",
    })
    await db.audit_logs.insert_many([
        {"id": str(uuid.uuid4()), "actor_id": admin["id"], "actor_email": "admin@brightloop.io", "action": "seed.completed", "entity": "system", "entity_id": None, "details": "Demo data seeded", "created_at": datetime.now(timezone.utc)},
        {"id": str(uuid.uuid4()), "actor_id": staff["id"], "actor_email": "staff@brightloop.io", "action": "billing.run", "entity": "billing", "entity_id": None, "details": "Seeded history generated", "created_at": datetime.now(timezone.utc)},
    ])

    # --- reminders for whatever is overdue after all of the above ---------------
    tracked = await schedule_reminders()

    subs_total = await db.subscriptions.count_documents({})
    invoices_total = await db.invoices.count_documents({})
    payments_total = await db.payments.count_documents({})
    print(f"Seed complete: {len(customers)} customers, {subs_total} subscriptions, "
          f"{invoices_total} invoices, {payments_total} payments, {tracked} overdue invoices tracked.")


async def main() -> None:
    force = "--reset" in sys.argv
    if not force and await db.users.find_one({"email": "admin@brightloop.io"}):
        print("Seed skipped: admin@brightloop.io already exists (use --reset to reseed).")
        return
    if force:
        print("Resetting database before re-seeding...")
        await reset()
    await seed()
    await ensure_indexes()  # ensure indexes exist after seeding
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
