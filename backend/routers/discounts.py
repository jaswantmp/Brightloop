"""Discounts — fixed or percentage, with eligibility windows and usage limits."""
import uuid

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import admin_required, audit, staff_required
from lib.db import db
from models.catalog import DiscountIn, DiscountOut

router = APIRouter(prefix="/discounts", tags=["discounts"])


def _out(doc: dict) -> dict:
    return {k: doc.get(k) for k in DiscountOut.model_fields}


@router.get("", response_model=list[DiscountOut])
async def list_discounts(_principal=Depends(staff_required)):
    docs = await db.discounts.find().sort([("created_at", -1)]).to_list(500)
    return [_out(d) for d in docs]


@router.post("", response_model=DiscountOut, status_code=201)
async def create_discount(body: DiscountIn, principal=Depends(admin_required)):
    if body.start_date and body.end_date and body.start_date > body.end_date:
        raise HTTPException(status_code=422, detail="start_date must be before end_date")
    doc = {"id": str(uuid.uuid4()), "used_count": 0, "created_at": lib_now(), **body.model_dump()}
    await db.discounts.insert_one(doc)
    await audit(principal, "discount.created", "discount", doc["id"], doc["name"])
    return _out(doc)


def lib_now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


@router.patch("/{discount_id}", response_model=DiscountOut)
async def update_discount(discount_id: str, body: DiscountIn, principal=Depends(admin_required)):
    if not await db.discounts.find_one({"id": discount_id}):
        raise HTTPException(status_code=404, detail="Not found")
    await db.discounts.update_one({"id": discount_id}, {"$set": body.model_dump()})
    await audit(principal, "discount.updated", "discount", discount_id)
    doc = await db.discounts.find_one({"id": discount_id})
    return _out(doc or {})


@router.delete("/{discount_id}")
async def delete_discount(discount_id: str, principal=Depends(admin_required)):
    if not await db.discounts.find_one({"id": discount_id}):
        raise HTTPException(status_code=404, detail="Not found")
    await db.discounts.delete_one({"id": discount_id})
    await audit(principal, "discount.deleted", "discount", discount_id)
    return {"ok": True}
