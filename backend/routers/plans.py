"""Billing plans (daily/weekly/monthly/yearly) with lifecycle rule flags."""
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import admin_required, any_role, audit
from lib.db import db
from models.catalog import PlanIn, PlanOut

router = APIRouter(prefix="/plans", tags=["plans"])


def _out(doc: dict[str, Any]) -> dict[str, Any]:
    return {k: doc.get(k) for k in PlanOut.model_fields}


@router.get("", response_model=list[PlanOut])
async def list_plans(_principal=Depends(any_role)):
    docs = await db.plans.find().sort([("price_cents", 1)]).to_list(1000)
    return [_out(d) for d in docs]


@router.post("", response_model=PlanOut, status_code=201)
async def create_plan(body: PlanIn, principal=Depends(admin_required)):
    if body.available_from and body.available_to and body.available_from > body.available_to:
        raise HTTPException(status_code=422, detail="available_from must be before available_to")
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.plans.insert_one(doc)
    await audit(principal, "plan.created", "plan", doc["id"], doc["name"])
    return _out(doc)


@router.patch("/{plan_id}", response_model=PlanOut)
async def update_plan(plan_id: str, body: PlanIn, principal=Depends(admin_required)):
    if not await db.plans.find_one({"id": plan_id}):
        raise HTTPException(status_code=404, detail="Not found")
    await db.plans.update_one({"id": plan_id}, {"$set": body.model_dump()})
    await audit(principal, "plan.updated", "plan", plan_id)
    doc = await db.plans.find_one({"id": plan_id})
    return _out(doc or {})


@router.delete("/{plan_id}")
async def archive_plan(plan_id: str, principal=Depends(admin_required)):
    if not await db.plans.find_one({"id": plan_id}):
        raise HTTPException(status_code=404, detail="Not found")
    await db.plans.update_one({"id": plan_id}, {"$set": {"active": False}})
    await audit(principal, "plan.archived", "plan", plan_id)
    return {"ok": True}
