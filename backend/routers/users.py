"""Staff/user management — ADMIN only (backend-enforced)."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import admin_required, audit
from lib.db import db
from lib.security import hash_password, validate_password
from models.auth import StaffCreateIn, StaffUpdateIn, UserOut

router = APIRouter(prefix="/users", tags=["users"])


def _user_out(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "role": u["role"],
        "customer_id": u.get("customer_id"),
        "status": u.get("status", "active"),
        "created_at": u.get("created_at"),
    }


@router.get("", response_model=list[UserOut])
async def list_users(_principal=Depends(admin_required)):
    users = await db.users.find().sort([("created_at", -1)]).to_list(1000)
    return [_user_out(u) for u in users]


@router.post("", response_model=UserOut, status_code=201)
async def create_user(body: StaffCreateIn, principal=Depends(admin_required)):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    err = validate_password(body.password)
    if err:
        raise HTTPException(status_code=422, detail=err)
    if body.role == "CUSTOMER":
        if not body.customer_id:
            raise HTTPException(status_code=422, detail="CUSTOMER accounts need a customer_id")
        if not await db.customers.find_one({"id": body.customer_id}):
            raise HTTPException(status_code=404, detail="Customer not found")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "role": body.role,
        "customer_id": body.customer_id if body.role == "CUSTOMER" else None,
        "password_hash": hash_password(body.password),
        "status": "active",
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    await audit(principal, "user.created", "user", doc["id"], f"{email} as {body.role}")
    return _user_out(doc)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(user_id: str, body: StaffUpdateIn, principal=Depends(admin_required)):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    updates: dict = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.role is not None:
        updates["role"] = body.role
    if body.status is not None:
        if user_id == principal.user_id and body.status == "disabled":
            raise HTTPException(status_code=400, detail="You cannot disable your own account")
        updates["status"] = body.status
    if body.password:
        err = validate_password(body.password)
        if err:
            raise HTTPException(status_code=422, detail=err)
        updates["password_hash"] = hash_password(body.password)
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
        if "password_hash" in updates or body.status == "disabled":
            await db.sessions.delete_many({"user_id": user_id})
    await audit(principal, "user.updated", "user", user_id, ", ".join(updates.keys()))
    return _user_out({**user, **updates})
