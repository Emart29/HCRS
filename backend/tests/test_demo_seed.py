"""Regression: with real PayPal keys, AUTO_SEED crashed startup by authorizing unapproved sandbox orders."""

from fastapi.testclient import TestClient

from app.main import create_app
from app.payments.paypal import PayPalError
from app.store import Store


class RejectingPayPal:
    """Behaves like the real sandbox for orders nobody approved: every money call is refused."""

    mode = "sandbox"

    def __init__(self):
        self.calls = []

    def _refuse(self, name, *a, **k):
        self.calls.append(name)
        raise PayPalError("UNPROCESSABLE_ENTITY", 422)

    def create_order(self, *a, **k):
        self.calls.append("create_order")
        return {"id": "REAL-ORDER", "status": "CREATED", "approve_url": "https://paypal/approve"}

    def authorize_order(self, *a, **k):
        return self._refuse("authorize_order")

    def capture_authorization(self, *a, **k):
        return self._refuse("capture_authorization")

    def void_authorization(self, *a, **k):
        return self._refuse("void_authorization")

    def refund_capture(self, *a, **k):
        return self._refuse("refund_capture")

    def create_payout(self, *a, **k):
        return self._refuse("create_payout")

    def verify_webhook(self, *a, **k):
        return False


def test_auto_seed_never_touches_real_paypal(settings, monkeypatch):
    monkeypatch.setenv("AUTO_SEED", "true")
    gateway = RejectingPayPal()
    client = TestClient(create_app(settings=settings, store=Store(":memory:"), gateway=gateway))

    cases = client.get("/api/cases").json()
    assert len(cases) >= 8, "app must boot with sample data"
    assert gateway.calls == [], "seeding must not call the real PayPal account"
    assert all(c["payment"]["mode"] == "demo" for c in cases)

    # Seeded cases stay actionable in the clinic console (even though the in-memory demo state is fresh).
    held = next(c for c in cases if c["status"] == "funds_held" and c["review"]["status"] != "pending")
    assert client.post(f"/api/cases/{held['id']}/confirm", json={}).json()["status"] == "completed"
    assert gateway.calls == []


def test_real_cases_still_use_real_paypal(settings):
    gateway = RejectingPayPal()
    client = TestClient(create_app(settings=settings, store=Store(":memory:"), gateway=gateway))
    case = client.post("/api/triage", json={"symptoms": "Sore throat and runny nose", "age": 27}).json()
    assert case["payment"]["mode"] == "sandbox"
    case = client.post(f"/api/cases/{case['id']}/checkout", json={"provider_id": case["triage"]["providers"][0]["id"]}).json()
    assert gateway.calls == ["create_order"]
    r = client.post(f"/api/cases/{case['id']}/authorize", json={"order_id": "REAL-ORDER"})
    assert r.status_code == 502 and "UNPROCESSABLE_ENTITY" in r.json()["detail"]


def test_seed_failure_does_not_block_startup(settings, monkeypatch):
    import app.main as main

    monkeypatch.setenv("AUTO_SEED", "true")
    monkeypatch.setattr(main.demo, "seed", lambda service: (_ for _ in ()).throw(RuntimeError("boom")))
    client = TestClient(create_app(settings=settings, store=Store(":memory:"), gateway=RejectingPayPal()))
    assert client.get("/api/health").json() == {"status": "ok"}
