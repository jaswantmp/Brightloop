"""Tax rules — read for pricing forms (staff), mutations ADMIN-only."""
import uuid

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import admin_required, audit, staff_required
from lib.db import db
from models.catalog import TaxIn, TaxOut

router = APIRouter(prefix="/taxes", tags=["taxes"])


def _out(doc: dict) -> dict:
    return {k: doc.get(k) for k in TaxOut.model_fields}


@router.get("", response_model=list[TaxOut])
async def list_taxes(_principal=Depends(staff_required)):
    docs = await db.taxes.find().sort([("rate_bps", -1)]).to_list(500)
    return [_out(d) for d in docs]


@router.post("", response_model=TaxOut, status_code=201)
async def create_tax(body: TaxIn, principal=Depends(admin_required)):
    if body.is_default:
        await db.taxes.update_many({}, {"$set": {"is_default": False}})
    doc = {"id": str(uuid.uuid4()), **body.model_dump()}
    await db.taxes.insert_one(doc)
    await audit(principal, "tax.created", "tax", doc["id"], doc["name"])
    return _out(doc)


@router.patch("/{tax_id}", response_model=TaxOut)
async def update_tax(tax_id: str, body: TaxIn, principal=Depends(admin_required)):
    if not await db.taxes.find_one({"id": tax_id}):
        raise HTTPException(status_code=404, detail="Not found")
    if body.is_default:
        await db.taxes.update_many({}, {"$set": {"is_default": False}})
    await db.taxes.update_one({"id": tax_id}, {"$set": body.model_dump()})
    await audit(principal, "tax.updated", "tax", tax_id)
    doc = await db.taxes.find_one({"id": tax_id})
    return _out(doc or {})


@router.delete("/{tax_id}")
async def delete_tax(tax_id: str, principal=Depends(admin_required)):
    if not await db.taxes.find_one({"id": tax_id}):
        raise HTTPException(status_code=404, detail="Not found")
    await db.taxes.delete_one({"id": tax_id})
    await audit(principal, "tax.deleted", "tax", tax_id)
    return {"ok": True}
