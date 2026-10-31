"""Authentication: login/logout, session cookie, password reset & change."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import (
    COOKIE_NAME,
    audit,
    clear_session_cookie,
    get_principal,
    login,
    logout,
    set_session_cookie,
)
from lib.db import db
from lib.security import hash_password, validate_password, verify_password
from models.auth import ChangePasswordIn, ForgotIn, LoginIn, ResetIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
async def do_login(body: LoginIn, response: Response):
    result = await login(body.email, body.password)
    if not result:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token, principal = result
    set_session_cookie(response, token)
    await audit(principal, "auth.login", "user", principal.user_id)
    return principal.out()


@router.post("/logout")
async def do_logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        await logout(token)
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(principal=Depends(get_principal)):
    return principal.out()


@router.post("/forgot-password")
async def forgot(body: ForgotIn):
    """Email delivery is NOT configured in this build: no link is sent.

    Demo affordance: when the account exists the reset token is returned here,
    clearly labeled, so the flow is testable. Configure an email provider to
    replace this honestly.
    """
    user = await db.users.find_one({"email": body.email.strip().lower()})
    if not user:
        return {
            "email_configured": False,
            "sent": False,
            "message": "Email delivery is not configured.",
            "reset_token": None,
        }
    token = uuid.uuid4().hex + uuid.uuid4().hex
    await db.password_resets.insert_one(
        {
            "id": token,
            "user_id": user["id"],
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
            "used_at": None,
        }
    )
    return {
        "email_configured": False,
        "sent": False,
        "message": "Email delivery is not configured. Demo mode: copy the reset token below to reset the password.",
        "reset_token": token,
    }


@router.post("/reset-password")
async def reset(body: ResetIn):
    rec = await db.password_resets.find_one({"id": body.token})
    if not rec or rec.get("used_at"):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    if rec["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    err = validate_password(body.password)
    if err:
        raise HTTPException(status_code=422, detail=err)
    await db.users.update_one(
        {"id": rec["user_id"]},
        {"$set": {"password_hash": hash_password(body.password)}},
    )
    await db.password_resets.update_one(
        {"id": body.token}, {"$set": {"used_at": datetime.now(timezone.utc)}}
    )
    await db.sessions.delete_many({"user_id": rec["user_id"]})
    return {"ok": True, "message": "Password updated. Sign in with the new password."}


@router.post("/change-password")
async def change(body: ChangePasswordIn, principal=Depends(get_principal)):
    user = await db.users.find_one({"id": principal.user_id})
    if not user or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    err = validate_password(body.new_password)
    if err:
        raise HTTPException(status_code=422, detail=err)
    await db.users.update_one(
        {"id": principal.user_id},
        {"$set": {"password_hash": hash_password(body.new_password)}},
    )
    await db.sessions.delete_many({"user_id": principal.user_id})
    await audit(principal, "auth.password_changed", "user", principal.user_id)
    return {"ok": True, "message": "Password changed. Please sign in again."}
