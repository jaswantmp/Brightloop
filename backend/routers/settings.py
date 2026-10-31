"""System settings + audit history — ADMIN only."""
import uuid
from typing import Any

from fastapi import APIRouter, Depends

from lib.auth import admin_required, audit
from lib.db import db
from models.system import AuditOut, SettingsIn, SettingsOut

router = APIRouter(tags=["settings"])


async def _settings_doc() -> dict[str, Any]:
    doc = await db.settings.find_one({"id": "app"})
    if not doc:
        doc = {"id": "app", **SettingsIn().model_dump()}
        await db.settings.insert_one(doc)
    return doc


@router.get("/settings", response_model=SettingsOut)
async def get_settings(_principal=Depends(admin_required)):
    doc = await _settings_doc()
    demo = await db.subscriptions.find_one({"is_demo": True})
    return SettingsOut(
        **{k: doc.get(k) for k in SettingsIn.model_fields},
        demo_mode=bool(demo),
    )


@router.put("/settings", response_model=SettingsOut)
async def update_settings(body: SettingsIn, principal=Depends(admin_required)):
    await _settings_doc()
    await db.settings.update_one({"id": "app"}, {"$set": body.model_dump()})
    await audit(principal, "settings.updated", "settings", "app")
    doc = await db.settings.find_one({"id": "app"})
    demo = await db.subscriptions.find_one({"is_demo": True})
    return SettingsOut(**{k: doc.get(k) for k in SettingsIn.model_fields}, demo_mode=bool(demo))


@router.get("/audit", response_model=list[AuditOut])
async def list_audit(_principal=Depends(admin_required)):
    docs = await db.audit_logs.find().sort([("created_at", -1)]).to_list(200)
    rows = []
    for d in docs:
        created = d.get("created_at")
        rows.append(
            AuditOut(
                id=d.get("id") or str(uuid.uuid4()),
                actor_email=d.get("actor_email"),
                action=d["action"],
                entity=d["entity"],
                entity_id=d.get("entity_id"),
                details=d.get("details", ""),
                created_at=created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
            )
        )
    return rows
