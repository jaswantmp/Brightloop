"""Products and their pricing variants."""
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import admin_required, audit, staff_required
from lib.db import db
from models.catalog import ProductIn, ProductOut, VariantIn, VariantOut

router = APIRouter(prefix="/products", tags=["products"])


def _variant_out(v: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": v["id"],
        "product_id": v["product_id"],
        "name": v["name"],
        "adjustment_type": v["adjustment_type"],
        "adjustment_value": v["adjustment_value"],
    }


def effective_price_cents(sales_price_cents: int, variant: dict[str, Any] | None) -> int:
    if not variant:
        return sales_price_cents
    if variant["adjustment_type"] == "fixed":
        return max(0, sales_price_cents + variant["adjustment_value"])
    return max(0, sales_price_cents + round(sales_price_cents * variant["adjustment_value"] / 10000))


async def _product_with_variants(product_id: str) -> dict[str, Any] | None:
    doc = await db.products.find_one({"id": product_id})
    if not doc:
        return None
    variants = await db.product_variants.find({"product_id": product_id}).to_list(500)
    doc["variants"] = [_variant_out(v) for v in variants]
    return doc


@router.get("", response_model=list[ProductOut])
async def list_products(q: str = "", _principal=Depends(staff_required)):
    query = {}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    docs = await db.products.find(query).sort([("created_at", -1)]).to_list(1000)
    for d in docs:
        variants = await db.product_variants.find({"product_id": d["id"]}).to_list(500)
        d["variants"] = [_variant_out(v) for v in variants]
    return [{k: d.get(k) for k in ProductOut.model_fields} for d in docs]


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: str, _principal=Depends(staff_required)):
    doc = await _product_with_variants(product_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return {k: doc.get(k) for k in ProductOut.model_fields}


@router.post("", response_model=ProductOut, status_code=201)
async def create_product(body: ProductIn, principal=Depends(admin_required)):
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.products.insert_one(doc)
    await audit(principal, "product.created", "product", doc["id"], doc["name"])
    doc["variants"] = []
    return {k: doc.get(k) for k in ProductOut.model_fields}


@router.patch("/{product_id}", response_model=ProductOut)
async def update_product(product_id: str, body: ProductIn, principal=Depends(admin_required)):
    await db.products.find_one({"id": product_id}) or _raise()
    await db.products.update_one({"id": product_id}, {"$set": body.model_dump()})
    await audit(principal, "product.updated", "product", product_id)
    doc = await _product_with_variants(product_id)
    return {k: (doc or {}).get(k) for k in ProductOut.model_fields}


def _raise():
    raise HTTPException(status_code=404, detail="Not found")


@router.delete("/{product_id}")
async def archive_product(product_id: str, principal=Depends(admin_required)):
    await db.products.find_one({"id": product_id}) or _raise()
    await db.products.update_one({"id": product_id}, {"$set": {"active": False}})
    await audit(principal, "product.archived", "product", product_id)
    return {"ok": True}


# --- variants ------------------------------------------------------------
@router.post("/{product_id}/variants", response_model=VariantOut, status_code=201)
async def create_variant(product_id: str, body: VariantIn, principal=Depends(admin_required)):
    await db.products.find_one({"id": product_id}) or _raise()
    doc = {
        "id": str(uuid.uuid4()),
        "product_id": product_id,
        **body.model_dump(),
    }
    await db.product_variants.insert_one(doc)
    await audit(principal, "variant.created", "product_variant", doc["id"], doc["name"])
    return _variant_out(doc)


@router.patch("/{product_id}/variants/{variant_id}", response_model=VariantOut)
async def update_variant(
    product_id: str, variant_id: str, body: VariantIn, principal=Depends(admin_required)
):
    await db.product_variants.find_one({"id": variant_id, "product_id": product_id}) or _raise()
    await db.product_variants.update_one(
        {"id": variant_id}, {"$set": body.model_dump()}
    )
    await audit(principal, "variant.updated", "product_variant", variant_id)
    doc = await db.product_variants.find_one({"id": variant_id})
    return _variant_out(doc or {})


@router.delete("/{product_id}/variants/{variant_id}")
async def delete_variant(product_id: str, variant_id: str, principal=Depends(admin_required)):
    await db.product_variants.find_one({"id": variant_id, "product_id": product_id}) or _raise()
    await db.product_variants.delete_one({"id": variant_id})
    await audit(principal, "variant.deleted", "product_variant", variant_id)
    return {"ok": True}
