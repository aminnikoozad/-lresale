from http.server import BaseHTTPRequestHandler
import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.parse import urlparse, parse_qs

MAX_SALE_VALUE = 10_000_000


def calculate_commission(initial_price: Decimal, sale_price: Decimal | None = None) -> dict:
    if not initial_price.is_finite() or initial_price < 25 or initial_price > MAX_SALE_VALUE:
        raise ValueError("initial price is outside the accepted range")

    final_price = initial_price if sale_price is None else sale_price
    if not final_price.is_finite() or final_price < 0 or final_price > MAX_SALE_VALUE:
        raise ValueError("sale price is outside the accepted range")

    if initial_price < 100:
        seller_rate = Decimal("0.45")
    elif initial_price < 250:
        seller_rate = Decimal("0.50")
    elif initial_price < 500:
        seller_rate = Decimal("0.55")
    else:
        seller_rate = Decimal("0.65")

    platform_rate = Decimal("1") - seller_rate
    seller_amount = (final_price * seller_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    platform_amount = final_price - seller_amount

    return {
        "initial_approved_price": float(initial_price),
        "final_sale_price": float(final_price),
        "seller_rate": float(seller_rate),
        "platform_rate": float(platform_rate),
        "seller_amount": float(seller_amount),
        "platform_amount": float(platform_amount),
        "currency": "CAD",
    }


class handler(BaseHTTPRequestHandler):
    server_version = "Rewear"
    sys_version = ""

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        query = parse_qs(urlparse(self.path).query)
        initial_price = query.get("initial_price", query.get("value", [None]))[0]
        sale_price = query.get("sale_price", [None])[0]

        if initial_price is None:
            self.send_json(200, {
                "ok": True,
                "service": "Rewear Python API",
                "message": "Python backend is running",
                "example": "/api/python?initial_price=275&sale_price=220",
            })
            return

        try:
            if len(initial_price) > 32 or (sale_price is not None and len(sale_price) > 32):
                raise ValueError("price is too long")
            result = calculate_commission(
                Decimal(initial_price),
                Decimal(sale_price) if sale_price is not None else None,
            )
            self.send_json(200, {"ok": True, "result": result})
        except (InvalidOperation, TypeError, ValueError):
            self.send_json(400, {
                "ok": False,
                "error": f"initial_price must be from 25 to {MAX_SALE_VALUE}; sale_price must be from 0 to {MAX_SALE_VALUE}",
            })

    def do_POST(self) -> None:
        self.send_json(405, {"ok": False, "error": "method not allowed"})
