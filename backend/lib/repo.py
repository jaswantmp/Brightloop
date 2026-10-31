"""Repository layer — the single seam for a future PostgreSQL swap.

All routers obtain collection handles through `repo()` and scope queries with
the helpers in lib/auth.py (`customer_filter`, `load_scoped`). To move to
PostgreSQL later:

  1. Re-implement `repo()` on asyncpg/SQLAlchemy returning an object with the
     same narrow surface the routers use (find/find_one/insert_one/
     update_one/delete_one/count_documents + aggregate for reports).
  2. Convert documents to typed rows via the Pydantic models in models/ —
     they already define the canonical schema (ids are plain uuid4 strings,
     money is integer cents, dates are ISO strings, so mapping is mechanical).
  3. Recreate the indexes listed in lib/db.py INDEXES as migrations
     (Alembic), including the unique (subscription_id, period_start) invoice
     constraint that prevents duplicate billing.

No route code imports motor directly, so nothing else changes.
"""
from motor.motor_asyncio import AsyncIOMotorCollection

from .db import db

__all__ = ["repo"]


def repo(collection: str) -> AsyncIOMotorCollection:
    """Named-collection handle. Role/record scoping is enforced by callers via
    lib/auth.py helpers — see that module for the deny-by-default contract."""
    return db[collection]
