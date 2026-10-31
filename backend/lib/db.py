import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

# Ensure .env in the backend directory is loaded safely before reading variables
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

logger = logging.getLogger(__name__)


def _mask_uri(uri: str) -> str:
    """Mask credentials in connection string for safe logging."""
    if not uri:
        return "<empty>"
    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", uri)


# Priority: MONGODB_URI (standard Atlas/cloud), MONGO_URL (legacy), MONGO_URI
MONGO_URI = (
    os.environ.get("MONGODB_URI")
    or os.environ.get("MONGO_URL")
    or os.environ.get("MONGO_URI")
)

if not MONGO_URI:
    MONGO_URI = "mongodb://localhost:27017"
    logger.warning(
        "No MONGODB_URI or MONGO_URL found in %s; defaulting to localhost:27017",
        BACKEND_DIR / ".env",
    )
else:
    logger.info("MongoDB configured with URI: %s", _mask_uri(MONGO_URI))

DB_NAME = (
    os.environ.get("DB_NAME")
    or os.environ.get("MONGODB_DB_NAME")
    or "brightloop"
)

client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=5000)

try:
    db = client.get_default_database(default=DB_NAME)
except Exception:
    db = client[DB_NAME]


# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "users": [
        IndexModel([("email", ASCENDING)], name="email_unique", unique=True),
        IndexModel([("role", ASCENDING)], name="role"),
    ],
    "sessions": [IndexModel([("user_id", ASCENDING)], name="user_id")],
    "password_resets": [IndexModel([("user_id", ASCENDING)], name="user_id")],
    "customers": [
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
        IndexModel([("email", ASCENDING)], name="email"),
    ],
    "products": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "product_variants": [IndexModel([("product_id", ASCENDING)], name="product_id")],
    "plans": [IndexModel([("price_cents", ASCENDING)], name="price")],
    "taxes": [IndexModel([("is_default", ASCENDING)], name="is_default")],
    "discounts": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "quotations": [
        IndexModel([("number", ASCENDING)], name="number_unique", unique=True),
        IndexModel([("customer_id", ASCENDING), ("created_at", DESCENDING)], name="customer_created"),
        IndexModel([("status", ASCENDING)], name="status"),
    ],
    "quotation_templates": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "subscriptions": [
        IndexModel([("number", ASCENDING)], name="number_unique", unique=True),
        IndexModel([("customer_id", ASCENDING), ("created_at", DESCENDING)], name="customer_created"),
        IndexModel([("status", ASCENDING), ("next_billing_date", ASCENDING)], name="status_next_billing"),
    ],
    "invoices": [
        # Duplicate-billing backstop: one invoice per subscription per period.
        IndexModel(
            [("subscription_id", ASCENDING), ("period_start", ASCENDING)],
            name="sub_period_unique",
            unique=True,
            sparse=True,
        ),
        IndexModel([("number", ASCENDING)], name="number_unique", unique=True),
        IndexModel([("customer_id", ASCENDING), ("created_at", DESCENDING)], name="customer_created"),
        IndexModel([("status", ASCENDING), ("due_date", ASCENDING)], name="status_due"),
    ],
    "payments": [
        IndexModel([("number", ASCENDING)], name="number_unique", unique=True),
        IndexModel([("customer_id", ASCENDING), ("paid_at", DESCENDING)], name="customer_paid"),
        IndexModel([("invoice_id", ASCENDING)], name="invoice_id"),
        IndexModel([("paid_at", ASCENDING)], name="paid_at"),
    ],
    "reminders": [
        IndexModel([("invoice_id", ASCENDING), ("stage", ASCENDING)], name="invoice_stage", unique=True),
        IndexModel([("status", ASCENDING), ("scheduled_date", ASCENDING)], name="status_scheduled"),
    ],
    "change_requests": [IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created")],
    "audit_logs": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "counters": [IndexModel([("key", ASCENDING)], name="key_unique", unique=True)],
}


async def ping_db() -> dict:
    """Test connection to the configured database and return status (without leaking secrets)."""
    masked = _mask_uri(MONGO_URI)
    try:
        res = await client.admin.command("ping")
        logger.info("MongoDB connection verified successfully: %s (db: %s)", masked, db.name)
        return {"ok": True, "target": masked, "database": db.name, "result": res}
    except Exception as e:
        logger.error("Failed to connect to MongoDB at %s: %s", masked, e)
        return {"ok": False, "target": masked, "error": str(e)}


async def ensure_indexes() -> None:
    masked = _mask_uri(MONGO_URI)
    for coll_name, index_list in INDEXES.items():
        try:
            await db[coll_name].create_indexes(index_list)
        except Exception as e:
            logger.warning("Failed to create indexes for %s on %s: %s", coll_name, masked, e)
