"""Decimal-safe money helpers.

Every monetary amount in the system is an INTEGER number of cents (`*_cents`)
and every rate is an INTEGER number of basis points (`*_bps`, 850 = 8.5%).
No floats ever touch money, so invoice math is exact and repeatable.
Rounding is half-up on positive amounts, deterministic everywhere.
"""


def tax_cents(base_cents: int, bps: int) -> int:
    """Tax on `base_cents` at `bps` basis points (8.5% = 850)."""
    return int(base_cents * bps / 10000 + 0.5)


def discount_cents(subtotal_cents: int, dtype: str, value: int) -> int:
    """Discount for one line subtotal. `fixed` value is cents; `percentage` value is bps."""
    if subtotal_cents <= 0:
        return 0
    if dtype == "fixed":
        return min(value, subtotal_cents)
    if dtype == "percentage":
        return tax_cents(subtotal_cents, value)
    return 0


def line_math(
    quantity: int, unit_price_cents: int, discount: int, tax_bps: int
) -> dict[str, int]:
    """One line's canonical math: subtotal, discount, tax, total (all cents)."""
    subtotal = quantity * unit_price_cents
    taxable = subtotal - discount
    tax = tax_cents(taxable, tax_bps)
    return {
        "subtotal_cents": subtotal,
        "discount_cents": discount,
        "tax_cents": tax,
        "line_total_cents": taxable + tax,
    }


PERIOD_MONTHS = {"daily": 30.0, "weekly": 52.0 / 12.0, "monthly": 1.0, "yearly": 1.0 / 12.0}


def normalized_monthly_cents(unit_price_cents: int, billing_period: str) -> int:
    """Normalize one subscription's recurring value to a monthly figure (for MRR).

    Transparent assumptions: daily ~ 30 days/month, weekly ~ 52 weeks/year, yearly ~ 1/12.
    """
    multiplier = PERIOD_MONTHS.get(billing_period, 1.0)
    return int(round(unit_price_cents * multiplier))


def format_money(cents: int, currency: str = "USD") -> str:
    """Server-side rendering helper (reports, AI context). Frontend formats its own."""
    sign = "-" if cents < 0 else ""
    return f"{sign}${abs(cents) / 100:,.2f}"
