from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs


def calculate_commission(value: float) -> dict:
    if value < 0:
        raise ValueError("value must be non-negative")

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
    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
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
            result = calculate_commission(float(value))
            self.send_json(200, {"ok": True, "result": result})
        except (TypeError, ValueError):
            self.send_json(400, {
                "ok": False,
                "error": "value must be a valid non-negative number",
            })
