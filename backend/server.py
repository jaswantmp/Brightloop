import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
import uuid
from datetime import datetime


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes, ping_db


# Startup runs before the yield, shutdown after it.
@asynccontextmanager
async def lifespan(app: FastAPI):
    await ping_db()
    app.state.index_task = asyncio.create_task(ensure_indexes())  # background: a big index build must not block boot
    yield
    client.close()


# Create the main app without a prefix
app = FastAPI(lifespan=lifespan)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Connectivity probe kept from the template (used by tests + smoke checks).
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str


@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.model_dump())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


# --- Brightloop routers (all under /api, mounted before the final include) ---
from routers.auth import router as auth_router
from routers.users import router as users_router
from routers.customers import router as customers_router
from routers.products import router as products_router
from routers.plans import router as plans_router
from routers.taxes import router as taxes_router
from routers.discounts import router as discounts_router
from routers.quotations import router as quotations_router, templates_router
from routers.subscriptions import router as subscriptions_router
from routers.invoices import router as invoices_router
from routers.payments import router as payments_router
from routers.recovery import router as recovery_router
from routers.reports import router as reports_router
from routers.ai import router as ai_router
from routers.settings import router as settings_router
from routers.cron import router as cron_router

api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(customers_router)
api_router.include_router(products_router)
api_router.include_router(plans_router)
api_router.include_router(taxes_router)
api_router.include_router(discounts_router)
api_router.include_router(quotations_router)
api_router.include_router(templates_router)
api_router.include_router(subscriptions_router)
api_router.include_router(invoices_router)
api_router.include_router(payments_router)
api_router.include_router(recovery_router)
api_router.include_router(reports_router)
api_router.include_router(ai_router)
api_router.include_router(settings_router)
api_router.include_router(cron_router)

# Include the router in the main app — keep this the LAST route registration.
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
