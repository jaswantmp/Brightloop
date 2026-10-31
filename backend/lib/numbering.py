"""Sequential document numbers: INV-2026-0001, SUB-2026-0001, QT-2026-0001, PAY-2026-0001.

Uses an atomic find_one_and_update on a `counters` collection — safe under
concurrency; the unique index on invoices.subscription_id+period_start is the
duplicate-billing backstop, not the numbering.
"""
from datetime import datetime, timezone

from .db import db


async def next_number(prefix: str) -> str:
    year = datetime.now(timezone.utc).year
    key = f"{prefix}{year}"
    doc = await db.counters.find_one_and_update(
        {"key": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return f"{key}-{doc['seq']:04d}"
