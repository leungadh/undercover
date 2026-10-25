from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from backend import db
from backend.main import app
from backend.seed import seed


def test_seed_counts(tmp_path, monkeypatch):
    monkeypatch.setenv("UNDERCOVER_DB", str(tmp_path / "undercover.db"))
    assert seed() == {
        "claims": 25,
        "policies": 50,
        "customers": 49,
        "plans": 3,
        "handlers": 3,
    }


def test_startup_builds_a_missing_database(tmp_path, monkeypatch):
    monkeypatch.setenv("UNDERCOVER_DB", str(tmp_path / "undercover.db"))
    with TestClient(app) as client:
        assert db.path().exists()
        assert len(client.get("/api/claims").json()) == 25


def test_queue(client):
    claims = client.get("/api/claims").json()
    assert len(claims) == 25
    assert {c["status"] for c in claims} == {"waiting"}
    assert claims[0] == {
        "claim_id": "CLM-1001",
        "customer_name": "Maya Patel",
        "claim_type": "trip_delay",
        "summary": "Flight home canceled by the airline, rebooked the next morning",
        "amount_claimed": 420.0,
        "submitted_on": "2026-06-24",
        "status": "waiting",
        "decision": None,
        "payout": None,
    }


def test_claim(client):
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["story"].startswith("My flight home from Rome")
    assert len(claim["items"]) == 3
    assert len(claim["documents"]) == 4
    assert claim["amount_claimed"] == 420.0
    assert claim["status"] == "waiting"
    assert claim["decision"] is None
    assert claim["paid_amount"] is None


def test_unknown_claim(client):
    response = client.get("/api/claims/CLM-9999")
    assert response.status_code == 404
    assert response.json() == {"detail": "Claim CLM-9999 not found"}


def test_policy_with_plan(client):
    policy = client.get("/api/policies/POL-2001").json()
    assert policy["plan"] == "premium"
    assert policy["trip"]["returns_on"] == "2026-06-18"
    assert policy["plan_details"]["deductible"] == 50.0
    assert policy["plan_details"]["trip_delay_max"] == 800.0


def test_unknown_policy(client):
    assert client.get("/api/policies/POL-9999").status_code == 404


def test_customer_with_history(client):
    customer = client.get("/api/customers/CUS-3001").json()
    assert customer["name"] == "Maya Patel"
    assert [c["claim_id"] for c in customer["previous_claims"]] == ["CLM-0412"]


def test_unknown_customer(client):
    assert client.get("/api/customers/CUS-9999").status_code == 404


def test_handlers(client):
    handlers = client.get("/api/handlers").json()
    assert [h["handler_id"] for h in handlers] == ["HND-01", "HND-02", "HND-03"]


def test_policy_wording(client):
    content = client.get("/api/policy-wording").json()["content"]
    assert content.startswith("# UnderCover Travel Insurance: Policy Wording")


def test_operations_follow_the_conventions():
    routes = [r for r in app.routes if isinstance(r, APIRoute)]
    for route in routes:
        doc = route.endpoint.__doc__
        assert route.operation_id, route.path
        assert doc, route.path
        assert "\n" not in doc.strip(), route.path

    schema = app.openapi()
    for path, operations in schema["paths"].items():
        for operation in operations.values():
            for parameter in operation.get("parameters", []):
                assert parameter["required"], path
            if "requestBody" in operation:
                body = operation["requestBody"]["content"]["application/json"]
                name = body["schema"]["$ref"].rsplit("/", 1)[-1]
                model = schema["components"]["schemas"][name]
                assert set(model["properties"]) == set(model["required"]), path
