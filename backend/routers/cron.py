"""Platform cron endpoint: daily billing run (see .emergent/crons.yml)."""
import asyncio
import hmac
import logging
import os

from fastapi import APIRouter, HTTPException, Request

from lib.billing import generate_due_invoices

router = APIRouter(prefix="/cron", tags=["cron"])
logger = logging.getLogger(__name__)


@router.post("/billing")
async def cron_billing(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not secret or not hmac.compare_digest(auth, f"Bearer {secret}"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        envelope = await request.json()
    except Exception:
        envelope = {}
    run_id = envelope.get("run_id", "local")
    asyncio.create_task(_run(run_id))
    return {"accepted": True, "run_id": run_id}


async def _run(run_id: str) -> None:
    try:
        summary = await generate_due_invoices()
        logger.info("cron billing run %s: %s", run_id, summary)
    except Exception:
        logger.exception("cron billing run %s failed", run_id)
