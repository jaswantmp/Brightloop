"""Auth & user models. TS mirrors live in frontend/src/lib/types.ts."""
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: Literal["ADMIN", "STAFF", "CUSTOMER"]
    customer_id: str | None = None
    status: str = "active"
    created_at: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class StaffCreateIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1)
    role: Literal["ADMIN", "STAFF", "CUSTOMER"]
    password: str
    customer_id: str | None = None


class StaffUpdateIn(BaseModel):
    name: str | None = None
    role: Literal["ADMIN", "STAFF", "CUSTOMER"] | None = None
    status: Literal["active", "disabled"] | None = None
    password: str | None = None
