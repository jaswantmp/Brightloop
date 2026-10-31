"""Password hashing + password policy. Sessions live in lib/auth.py."""
import re

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(password, hashed)
    except Exception:
        return False


def validate_password(password: str) -> str | None:
    """Return an error message when the policy fails, None when it passes.

    Policy: minimum 9 characters with at least one uppercase letter, one
    lowercase letter and one special (non-alphanumeric) character.
    """
    if len(password) < 9:
        return "Password must be at least 9 characters long."
    if not re.search(r"[A-Z]", password):
        return "Password must include an uppercase letter."
    if not re.search(r"[a-z]", password):
        return "Password must include a lowercase letter."
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must include a special character."
    return None
