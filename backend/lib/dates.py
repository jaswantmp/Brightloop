"""Date helpers for ISO string handling."""
from datetime import date


def today_iso() -> str:
    """Return today's date formatted as ISO 8601 YYYY-MM-DD."""
    return date.today().isoformat()

