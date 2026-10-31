"""Customers directory — staff/admin surface. Customers read their own record only."""
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field

from lib.auth import any_role, audit, customer_filter, load_scoped, staff_required
from lib.db import db

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerIn(BaseModel):
    name: str = Field(min_length=1)
    company: str = ""
    email: EmailStr
    phone: str = ""
    billing_address: str = ""
    notes: str = ""
    status: Literal["active", "archived"] = "active"


class CustomerOut(BaseModel):
    id: str
    name: str
    company: str
    email: str
    phone: str
    billing_address: str
    notes: str
    status: str
    created_at: str


def _out(doc: dict[str, Any]) -> dict[str, Any]:
    return {k: doc.get(k) for k in CustomerOut.model_fields if k in doc}


@router.get("", response_model=list[CustomerOut])
async def list_customers(
    q: str = "", status: str = "", principal=Depends(staff_required)
):
    query: dict[str, Any] = customer_filter(principal)
    if status:
        query["status"] = status
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": rx}, {"company": rx}, {"email": rx}]
    docs = await db.customers.find(query).sort([("created_at", -1)]).to_list(1000)
    return [_out(d) for d in docs]


@router.get("/{customer_id}", response_model=CustomerOut)
async def get_customer(customer_id: str, principal=Depends(any_role)):
    doc = await load_scoped(principal, "customers", customer_id)
    return _out(doc)


@router.post("", response_model=CustomerOut, status_code=201)
async def create_customer(body: CustomerIn, principal=Depends(staff_required)):
    doc = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "email": body.email.strip().lower(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.customers.insert_one(doc)
    await audit(principal, "customer.created", "customer", doc["id"], doc["name"])
    return _out(doc)


@router.patch("/{customer_id}", response_model=CustomerOut)
async def update_customer(
    customer_id: str, body: CustomerIn, principal=Depends(staff_required)
):
    await load_scoped(principal, "customers", customer_id)
    updates = {**body.model_dump(), "email": body.email.strip().lower()}
    await db.customers.update_one({"id": customer_id}, {"$set": updates})
    await audit(principal, "customer.updated", "customer", customer_id)
    doc = await db.customers.find_one({"id": customer_id})
    return _out(doc)


@router.delete("/{customer_id}")
async def archive_customer(customer_id: str, principal=Depends(staff_required)):
    await load_scoped(principal, "customers", customer_id)
    await db.customers.update_one(
        {"id": customer_id}, {"$set": {"status": "archived"}}
    )
    await audit(principal, "customer.archived", "customer", customer_id)
    return {"ok": True}
