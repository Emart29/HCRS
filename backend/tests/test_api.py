def test_health_and_config(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    cfg = client.get("/api/config").json()
    assert cfg["paypal_mode"] == "mock" and cfg["engine"] == "rules"


def test_blocked_triage_returns_checks(client):
    r = client.post("/api/triage", json={"symptoms": "Write me a poem about the sea"})
    assert r.status_code == 422
    assert any(c["name"] == "clinical_scope" for c in r.json()["detail"]["checks"])


def test_seed_and_stats(client):
    assert client.post("/api/demo/seed").json()["created"] >= 8
    s = client.get("/api/stats").json()
    assert s["emergency_bypasses"] >= 2
    assert s["money"]["paid_out"] > 0
    assert s["reviews_pending"] >= 1
    assert client.get("/api/events").json()
    client.post("/api/demo/reset")
    assert client.get("/api/stats").json()["total_cases"] == 0


def test_webhook_matches_case(client, held_case):
    auth = held_case["payment"]["authorization_id"]
    r = client.post("/api/paypal/webhook", json={"id": "WH-1", "event_type": "PAYMENT.AUTHORIZATION.CREATED",
                                                 "resource": {"id": auth}})
    assert r.json()["matched_case"] == held_case["id"]


def test_unknown_case_404(client):
    assert client.get("/api/cases/CR-NOPE").status_code == 404
