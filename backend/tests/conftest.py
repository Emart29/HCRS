import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app
from app.payments.paypal import MockPayPal
from app.store import Store


@pytest.fixture
def settings():
    s = get_settings()
    # Tests never call external services: rules engine + mock PayPal.
    return s.__class__(**{**s.__dict__, "gemini_api_key": None, "paypal_client_id": None, "paypal_client_secret": None})


@pytest.fixture
def client(settings):
    return TestClient(create_app(settings=settings, store=Store(":memory:"), gateway=MockPayPal()))


@pytest.fixture
def triage(client):
    def _triage(symptoms, **kw):
        r = client.post("/api/triage", json={"symptoms": symptoms, **kw})
        assert r.status_code == 200, r.text
        return r.json()
    return _triage


@pytest.fixture
def held_case(client, triage):
    """A routine case with funds authorized (held)."""
    case = triage("Burning when I pee and needing to go more often", age=41)
    assert case["triage"]["level"] == "routine"
    provider = case["triage"]["providers"][-1]
    case = client.post(f"/api/cases/{case['id']}/checkout", json={"provider_id": provider["id"]}).json()
    case = client.post(f"/api/cases/{case['id']}/authorize", json={"order_id": case["payment"]["order_id"]}).json()
    assert case["status"] == "funds_held"
    return case
