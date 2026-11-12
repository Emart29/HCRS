"""PayPal REST integration (Orders v2 with AUTHORIZE intent, Payments v2, Payouts v1, Webhooks).

Money flow for a non-emergency case:
  create order (intent=AUTHORIZE) -> patient approves in PayPal -> authorize (funds held)
  -> provider confirms consult -> capture (full, or partial after a clinician down-triage)
  -> payout to provider minus platform fee
  If a clinician up-triages to emergency or the visit never happens -> void authorization.
  If already captured and care is reduced -> partial refund.

`MockPayPal` implements the same interface with deterministic fake IDs so the
whole product can be demoed and tested without credentials.
"""

from __future__ import annotations

import base64
import time
import uuid
from typing import Protocol

import httpx


class PayPalError(Exception):
    def __init__(self, message: str, status: int | None = None, body: dict | str | None = None):
        super().__init__(message)
        self.status = status
        self.body = body


def money(amount: float, currency: str) -> dict:
    return {"currency_code": currency, "value": f"{amount:.2f}"}


class PaymentGateway(Protocol):
    mode: str

    def create_order(self, amount: float, currency: str, description: str, reference_id: str) -> dict: ...
    def authorize_order(self, order_id: str) -> dict: ...
    def capture_authorization(self, authorization_id: str, amount: float, currency: str, invoice_id: str) -> dict: ...
    def void_authorization(self, authorization_id: str) -> dict: ...
    def refund_capture(self, capture_id: str, amount: float, currency: str, note: str) -> dict: ...
    def create_payout(self, receiver: str, amount: float, currency: str, note: str, batch_id: str) -> dict: ...
    def verify_webhook(self, headers: dict, event: dict, webhook_id: str | None) -> bool: ...


class PayPalClient:
    mode = "sandbox"

    def __init__(self, client_id: str, client_secret: str, base_url: str, timeout: float = 20.0):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = base_url.rstrip("/")
        self.mode = "live" if "sandbox" not in self.base_url else "sandbox"
        self._token: str | None = None
        self._token_expiry = 0.0
        self._http = httpx.Client(timeout=timeout)

    def _access_token(self) -> str:
        if self._token and time.time() < self._token_expiry - 60:
            return self._token
        basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        r = self._http.post(f"{self.base_url}/v1/oauth2/token", data={"grant_type": "client_credentials"},
                            headers={"Authorization": f"Basic {basic}"})
        if r.status_code != 200:
            raise PayPalError("PayPal authentication failed - check PAYPAL_CLIENT_ID/SECRET", r.status_code, r.text)
        body = r.json()
        self._token = body["access_token"]
        self._token_expiry = time.time() + int(body.get("expires_in", 300))
        return self._token

    def _request(self, method: str, path: str, json: dict | None = None, idempotency_key: str | None = None) -> dict:
        headers = {"Authorization": f"Bearer {self._access_token()}", "Content-Type": "application/json",
                   "Prefer": "return=representation"}
        if idempotency_key:
            headers["PayPal-Request-Id"] = idempotency_key
        r = self._http.request(method, f"{self.base_url}{path}", json=json, headers=headers)
        if r.status_code >= 400:
            try:
                body = r.json()
            except ValueError:
                body = r.text
            msg = body.get("message", r.text) if isinstance(body, dict) else body
            raise PayPalError(f"PayPal {method} {path} failed: {msg}", r.status_code, body)
        return r.json() if r.content else {}

    def create_order(self, amount: float, currency: str, description: str, reference_id: str) -> dict:
        body = {
            "intent": "AUTHORIZE",
            "purchase_units": [{
                "reference_id": reference_id,
                "custom_id": reference_id,
                "description": description[:127],
                "amount": money(amount, currency),
            }],
            "payment_source": {"paypal": {"experience_context": {
                "brand_name": "CareRoute", "user_action": "CONTINUE", "shipping_preference": "NO_SHIPPING"}}},
        }
        order = self._request("POST", "/v2/checkout/orders", body, idempotency_key=f"order-{reference_id}-{uuid.uuid4()}")
        approve = next((link["href"] for link in order.get("links", []) if link.get("rel") in {"approve", "payer-action"}), None)
        return {"id": order["id"], "status": order.get("status"), "approve_url": approve}

    def authorize_order(self, order_id: str) -> dict:
        order = self._request("POST", f"/v2/checkout/orders/{order_id}/authorize", {}, idempotency_key=f"auth-{order_id}")
        auth = order["purchase_units"][0]["payments"]["authorizations"][0]
        payer = order.get("payer", {})
        return {"authorization_id": auth["id"], "status": auth["status"], "expires_at": auth.get("expiration_time"),
                "payer_email": payer.get("email_address")}

    def capture_authorization(self, authorization_id: str, amount: float, currency: str, invoice_id: str) -> dict:
        cap = self._request("POST", f"/v2/payments/authorizations/{authorization_id}/capture",
                            {"amount": money(amount, currency), "final_capture": True, "invoice_id": invoice_id},
                            idempotency_key=f"cap-{authorization_id}")
        return {"capture_id": cap["id"], "status": cap["status"]}

    def void_authorization(self, authorization_id: str) -> dict:
        self._request("POST", f"/v2/payments/authorizations/{authorization_id}/void", None,
                      idempotency_key=f"void-{authorization_id}")
        return {"status": "VOIDED"}

    def refund_capture(self, capture_id: str, amount: float, currency: str, note: str) -> dict:
        ref = self._request("POST", f"/v2/payments/captures/{capture_id}/refund",
                            {"amount": money(amount, currency), "note_to_payer": note[:255]},
                            idempotency_key=f"refund-{capture_id}-{amount:.2f}")
        return {"refund_id": ref["id"], "status": ref["status"]}

    def create_payout(self, receiver: str, amount: float, currency: str, note: str, batch_id: str) -> dict:
        body = {
            "sender_batch_header": {"sender_batch_id": batch_id, "email_subject": "CareRoute payment for consultation",
                                    "email_message": note},
            "items": [{"recipient_type": "EMAIL", "receiver": receiver, "amount": {"value": f"{amount:.2f}", "currency": currency},
                       "note": note, "sender_item_id": batch_id}],
        }
        out = self._request("POST", "/v1/payments/payouts", body, idempotency_key=f"payout-{batch_id}")
        header = out["batch_header"]
        return {"payout_batch_id": header["payout_batch_id"], "status": header["batch_status"]}

    def verify_webhook(self, headers: dict, event: dict, webhook_id: str | None) -> bool:
        if not webhook_id:
            return False
        h = {k.lower(): v for k, v in headers.items()}
        body = {
            "auth_algo": h.get("paypal-auth-algo"), "cert_url": h.get("paypal-cert-url"),
            "transmission_id": h.get("paypal-transmission-id"), "transmission_sig": h.get("paypal-transmission-sig"),
            "transmission_time": h.get("paypal-transmission-time"), "webhook_id": webhook_id, "webhook_event": event,
        }
        out = self._request("POST", "/v1/notifications/verify-webhook-signature", body)
        return out.get("verification_status") == "SUCCESS"


class MockPayPal:
    """In-memory stand-in for PayPal with the same contract.

    Used when no credentials are configured (mode "mock"), for seeded demo cases (mode "demo",
    so sample data never touches the real PayPal account), and in tests. IDs it has never seen
    (for example after a restart) are accepted, so seeded cases stay actionable.
    """

    def __init__(self, mode: str = "mock"):
        self.mode = mode
        self.orders: dict[str, dict] = {}
        self.auths: dict[str, dict] = {}
        self.captures: dict[str, dict] = {}

    @staticmethod
    def _id(prefix: str) -> str:
        return f"{prefix}{uuid.uuid4().hex[:15].upper()}"

    def create_order(self, amount: float, currency: str, description: str, reference_id: str) -> dict:
        oid = self._id("MOCK-ORD-")
        self.orders[oid] = {"amount": amount, "status": "CREATED"}
        return {"id": oid, "status": "CREATED", "approve_url": None}

    def authorize_order(self, order_id: str) -> dict:
        if order_id not in self.orders:
            self.orders[order_id] = {"amount": float("inf"), "status": "CREATED"}
        if self.orders[order_id]["status"] == "AUTHORIZED":
            raise PayPalError("Order already authorized", 422)
        self.orders[order_id]["status"] = "AUTHORIZED"
        aid = self._id("MOCK-AUTH-")
        self.auths[aid] = {"amount": self.orders[order_id]["amount"], "status": "CREATED"}
        return {"authorization_id": aid, "status": "CREATED", "expires_at": None, "payer_email": "patient@sandbox.example.com"}

    def capture_authorization(self, authorization_id: str, amount: float, currency: str, invoice_id: str) -> dict:
        auth = self.auths.setdefault(authorization_id, {"amount": float("inf"), "status": "CREATED"})
        if auth["status"] != "CREATED":
            raise PayPalError("Authorization not capturable", 422)
        if amount > auth["amount"] + 1e-9:
            raise PayPalError("Capture exceeds authorized amount", 422)
        auth["status"] = "CAPTURED"
        cid = self._id("MOCK-CAP-")
        self.captures[cid] = {"amount": amount, "refunded": 0.0}
        return {"capture_id": cid, "status": "COMPLETED"}

    def void_authorization(self, authorization_id: str) -> dict:
        auth = self.auths.setdefault(authorization_id, {"amount": float("inf"), "status": "CREATED"})
        if auth["status"] != "CREATED":
            raise PayPalError("Authorization not voidable", 422)
        auth["status"] = "VOIDED"
        return {"status": "VOIDED"}

    def refund_capture(self, capture_id: str, amount: float, currency: str, note: str) -> dict:
        cap = self.captures.setdefault(capture_id, {"amount": float("inf"), "refunded": 0.0})
        if cap["refunded"] + amount > cap["amount"] + 1e-9:
            raise PayPalError("Refund exceeds captured amount", 422)
        cap["refunded"] += amount
        return {"refund_id": self._id("MOCK-REF-"), "status": "COMPLETED"}

    def create_payout(self, receiver: str, amount: float, currency: str, note: str, batch_id: str) -> dict:
        return {"payout_batch_id": self._id("MOCK-PO-"), "status": "SUCCESS"}

    def verify_webhook(self, headers: dict, event: dict, webhook_id: str | None) -> bool:
        return True
