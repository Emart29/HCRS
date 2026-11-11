"""PayPalClient request-shape tests using httpx.MockTransport (no network)."""

import json

import httpx

from app.payments.paypal import PayPalClient


def make_client(handler):
    c = PayPalClient("id", "secret", "https://api-m.sandbox.paypal.com")
    c._http = httpx.Client(transport=httpx.MockTransport(handler))
    return c


def test_order_authorize_capture_payout_shapes():
    seen = []

    def handler(req: httpx.Request):
        is_json = req.headers.get("content-type", "").startswith("application/json") and req.content
        seen.append((req.method, req.url.path, json.loads(req.content) if is_json else None, dict(req.headers)))
        p = req.url.path
        if p == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "T", "expires_in": 3600})
        if p == "/v2/checkout/orders":
            return httpx.Response(201, json={"id": "O1", "status": "CREATED",
                                             "links": [{"rel": "approve", "href": "https://paypal/approve"}]})
        if p.endswith("/authorize"):
            return httpx.Response(201, json={"payer": {"email_address": "b@x.com"}, "purchase_units": [
                {"payments": {"authorizations": [{"id": "A1", "status": "CREATED", "expiration_time": "t"}]}}]})
        if p.endswith("/capture"):
            return httpx.Response(201, json={"id": "C1", "status": "COMPLETED"})
        if p == "/v1/payments/payouts":
            return httpx.Response(201, json={"batch_header": {"payout_batch_id": "B1", "batch_status": "PENDING"}})
        return httpx.Response(404, json={"message": "nope"})

    c = make_client(handler)
    order = c.create_order(25.0, "USD", "consult", "CR-1")
    assert order == {"id": "O1", "status": "CREATED", "approve_url": "https://paypal/approve"}
    body = seen[1][2]
    assert body["intent"] == "AUTHORIZE" and body["purchase_units"][0]["amount"] == {"currency_code": "USD", "value": "25.00"}
    assert "paypal-request-id" in seen[1][3]
    assert c.authorize_order("O1")["authorization_id"] == "A1"
    assert c.capture_authorization("A1", 20.0, "USD", "INV")["capture_id"] == "C1"
    assert seen[-1][2]["amount"]["value"] == "20.00" and seen[-1][2]["final_capture"] is True
    assert c.create_payout("p@x.com", 19.0, "USD", "n", "b1")["payout_batch_id"] == "B1"
    # token was fetched once and cached
    assert sum(1 for s in seen if s[1] == "/v1/oauth2/token") == 1


def test_errors_surface_paypal_message():
    def handler(req):
        if req.url.path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "T", "expires_in": 3600})
        return httpx.Response(422, json={"message": "UNPROCESSABLE_ENTITY"})

    c = make_client(handler)
    try:
        c.void_authorization("A1")
    except Exception as exc:
        assert "UNPROCESSABLE_ENTITY" in str(exc) and exc.status == 422
    else:
        raise AssertionError("expected PayPalError")
