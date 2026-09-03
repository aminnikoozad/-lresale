from http.server import BaseHTTPRequestHandler
import json
import math
from urllib.parse import urlparse, parse_qs

MAX_SALE_VALUE = 10_000_000


def calculate_commission(value: float) -> dict:
    if not math.isfinite(value) or value < 0 or value > MAX_SALE_VALUE:
        raise ValueError("value is outside the accepted range")

    if value <= 100:
        company_rate = 0.55
    elif value < 200:
        company_rate = 0.50
    elif value < 500:
        company_rate = 0.40
    else:
        company_rate = 0.30

    company_amount = round(value * company_rate, 2)
    customer_amount = round(value - company_amount, 2)

    return {
        "sale_value": round(value, 2),
        "company_rate": company_rate,
        "company_amount": company_amount,
        "customer_amount": customer_amount,
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
        value = query.get("value", [None])[0]

        if value is None:
            self.send_json(200, {
                "ok": True,
                "service": "Rewear Python API",
                "message": "Python backend is running",
                "example": "/api/python?value=250",
            })
            return

        try:
            if len(value) > 32:
                raise ValueError("value is too long")
            result = calculate_commission(float(value))
            self.send_json(200, {"ok": True, "result": result})
        except (TypeError, ValueError):
            self.send_json(400, {
                "ok": False,
                "error": f"value must be a finite number from 0 to {MAX_SALE_VALUE}",
            })

    def do_POST(self) -> None:
        self.send_json(405, {"ok": False, "error": "method not allowed"})
