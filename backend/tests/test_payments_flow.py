def test_emergency_rejects_checkout(client, triage):
    case = triage("Crushing chest pain spreading to my left arm and sweating", age=58)
    assert case["status"] == "emergency_routed" and case["payment"]["required"] is False
    r = client.post(f"/api/cases/{case['id']}/checkout", json={"provider_id": "P-ER-01"})
    assert r.status_code == 409


def test_full_happy_path_capture_and_payout(client, held_case):
    cid = held_case["id"]
    amount = held_case["payment"]["amount"]
    case = client.post(f"/api/cases/{cid}/confirm", json={"note": "seen"}).json()
    assert case["status"] == "completed"
    p = case["payment"]
    assert p["captured"] == amount
    assert p["platform_fee"] == round(amount * 0.05, 2)
    assert p["payout_amount"] == round(amount - p["platform_fee"], 2)
    types = [e["type"] for e in case["events"]]
    assert types.index("authorized") < types.index("captured") < types.index("payout")


def test_cannot_capture_twice(client, held_case):
    client.post(f"/api/cases/{held_case['id']}/confirm", json={})
    assert client.post(f"/api/cases/{held_case['id']}/confirm", json={}).status_code == 409


def test_cancel_voids_hold(client, held_case):
    case = client.post(f"/api/cases/{held_case['id']}/cancel", json={"reason": "no-show"}).json()
    assert case["status"] == "cancelled" and case["payment"]["status"] == "voided"


def test_downtriage_captures_less(client, held_case):
    cid = held_case["id"]
    case = client.post(f"/api/cases/{cid}/review", json={"action": "retriage", "new_level": "self_care"}).json()
    assert case["payment"]["adjusted_amount"] < held_case["payment"]["amount"]
    case = client.post(f"/api/cases/{cid}/confirm", json={}).json()
    assert case["payment"]["captured"] == case["payment"]["adjusted_amount"]


def test_downtriage_after_capture_partially_refunds(client, held_case):
    cid = held_case["id"]
    client.post(f"/api/cases/{cid}/confirm", json={})
    case = client.post(f"/api/cases/{cid}/review", json={"action": "retriage", "new_level": "self_care"}).json()
    assert case["payment"]["status"] == "partially_refunded" and case["payment"]["refunded"] > 0


def test_uptriage_to_emergency_releases_hold(client, held_case):
    case = client.post(f"/api/cases/{held_case['id']}/review",
                       json={"action": "retriage", "new_level": "emergency"}).json()
    assert case["status"] == "emergency_routed" and case["payment"]["status"] == "voided"


def test_escalated_case_requires_review_before_capture(client, triage):
    case = triage("I just feel weird and not myself, something is off and I'm tired", age=52)
    assert case["review"]["status"] == "pending"
    provider = case["triage"]["providers"][0]
    case = client.post(f"/api/cases/{case['id']}/checkout", json={"provider_id": provider["id"]}).json()
    client.post(f"/api/cases/{case['id']}/authorize", json={"order_id": case["payment"]["order_id"]})
    assert client.post(f"/api/cases/{case['id']}/confirm", json={}).status_code == 409
    client.post(f"/api/cases/{case['id']}/review", json={"action": "confirm"})
    assert client.post(f"/api/cases/{case['id']}/confirm", json={}).json()["status"] == "completed"


def test_provider_must_offer_level(client, triage):
    case = triage("Sore throat and runny nose", age=27)
    r = client.post(f"/api/cases/{case['id']}/checkout", json={"provider_id": "P-CLINIC-01"})
    assert r.status_code == 400


def test_authorize_rejects_foreign_order(client, triage):
    case = triage("Sore throat and runny nose", age=27)
    client.post(f"/api/cases/{case['id']}/checkout", json={"provider_id": case["triage"]["providers"][0]["id"]})
    assert client.post(f"/api/cases/{case['id']}/authorize", json={"order_id": "NOPE"}).status_code == 400
