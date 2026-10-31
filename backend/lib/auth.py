"""Sessions (httpOnly cookie), the request principal, and permission helpers.

Authorization contract (deny-by-default):
- `get_principal` builds the principal server-side from the session cookie and
  re-reads the user every request — a disabled user or revoked role stops
  working immediately.
- `require_roles(*roles)` = role/scope check → 403 when the role may not act.
- `customer_filter` / `load_scoped` = object-level check. A CUSTOMER asking for
  another customer's record gets 404 (not 403 — never leak existence).
- Every mutating route writes an `audit_logs` entry via `audit()`.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, Response

from .db import db
from .security import verify_password

COOKIE_NAME = "bl_session"
SESSION_DAYS = 30


class Principal:
    def __init__(self, user: dict[str, Any]):
        self.user_id: str = user["id"]
        self.email: str = user["email"]
        self.name: str = user.get("name", "")
        self.role: str = user["role"]  # ADMIN | STAFF | CUSTOMER
        self.customer_id: str | None = user.get("customer_id")

    def out(self) -> dict[str, Any]:
        return {
            "id": self.user_id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "customer_id": self.customer_id,
        }


async def login(email: str, password: str) -> tuple[str, Principal] | None:
    user = await db.users.find_one({"email": email.strip().lower()})
    if not user or not verify_password(password, user["password_hash"]):
        return None
    if user.get("status", "active") != "active":
        return None
    token = uuid.uuid4().hex + uuid.uuid4().hex
    await db.sessions.insert_one(
        {
            "id": token,
            "user_id": user["id"],
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
        }
    )
    return token, Principal(user)


async def logout(token: str) -> None:
    await db.sessions.delete_one({"id": token})


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_DAYS * 24 * 3600,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


async def get_principal(request: Request) -> Principal:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.sessions.find_one({"id": token})
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    expires_at = session.get("expires_at")
    if expires_at and expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"id": session["user_id"]})
    # Re-derive from source of truth: a disabled user / revoked role denies NOW.
    if not user or user.get("status", "active") != "active":
        raise HTTPException(status_code=401, detail="Account disabled")
    return Principal(user)


def require_roles(*roles: str):
    async def dep(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(status_code=403, detail="Not permitted for your role")
        return principal

    return dep


admin_required = require_roles("ADMIN")
staff_required = require_roles("ADMIN", "STAFF")
any_role = require_roles("ADMIN", "STAFF", "CUSTOMER")


def customer_filter(principal: Principal, customer_id: str | None = None) -> dict[str, Any]:
    """Mandatory record scope. CUSTOMER principals are pinned to their own
    customer_id — an explicit other-customer id is a denial (caller maps to 404)."""
    if principal.role == "CUSTOMER":
        if customer_id and customer_id != principal.customer_id:
            raise HTTPException(status_code=404, detail="Not found")
        return {"customer_id": principal.customer_id}
    if customer_id:
        return {"customer_id": customer_id}
    return {}


async def load_scoped(principal: Principal, collection: str, record_id: str) -> dict[str, Any]:
    """Fetch one record and enforce object-level visibility (404 when not visible)."""
    doc = await db[collection].find_one({"id": record_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if principal.role == "CUSTOMER" and doc.get("customer_id") != principal.customer_id:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


async def audit(
    principal: Principal | None,
    action: str,
    entity: str,
    entity_id: str | None,
    details: str = "",
) -> None:
    await db.audit_logs.insert_one(
        {
            "id": str(uuid.uuid4()),
            "actor_id": principal.user_id if principal else None,
            "actor_email": principal.email if principal else "system",
            "action": action,
            "entity": entity,
            "entity_id": entity_id,
            "details": details,
            "created_at": datetime.now(timezone.utc),
        }
    )
