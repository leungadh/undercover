import pytest


def start(client, claim_id="CLM-1001"):
    return client.post(f"/api/claims/{claim_id}/start")


def decide(client, decision="approve", payout=420.0, claim_id="CLM-1001"):
    return client.post(
        f"/api/claims/{claim_id}/decision",
        json={
            "decision": decision,
            "payout": payout,
            "reason": "The delay is covered.",
            "policy_section": "Section 3, Trip Delay",
        },
    )


def pay(client, amount, claim_id="CLM-1001"):
    return client.post(f"/api/claims/{claim_id}/payment", json={"amount": amount})


def sign_off(client, handler_id="HND-01", claim_id="CLM-1001"):
    return client.post(
        f"/api/claims/{claim_id}/sign-off", json={"handler_id": handler_id}
    )


def test_start_claim(client):
    response = start(client)
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"
    again = start(client)
    assert again.status_code == 409
    assert again.json() == {"detail": "Claim CLM-1001 is in_progress, not waiting"}


def test_start_unknown_claim(client):
    assert start(client, "CLM-9999").status_code == 404


def test_steps_in_order(client):
    for title in ["Read claim CLM-1001", "Read policy POL-2001"]:
        response = client.post(
            "/api/claims/CLM-1001/steps",
            json={"kind": "tool_call", "title": title, "detail": "{}"},
        )
        assert response.status_code == 200
    steps = client.get("/api/claims/CLM-1001/steps").json()
    assert [s["title"] for s in steps] == [
        "Read claim CLM-1001",
        "Read policy POL-2001",
    ]
    assert steps[0]["kind"] == "tool_call"
    assert steps[0]["detail"] == "{}"
    assert steps[0]["created_at"]
    assert steps[0]["step_id"] < steps[1]["step_id"]


def test_steps_of_unknown_claim(client):
    assert client.get("/api/claims/CLM-9999/steps").status_code == 404


def test_decide_needs_a_claim_in_progress(client):
    assert decide(client).status_code == 409


def test_approve_and_pay_under_the_limit(client):
    start(client)
    claim = decide(client).json()
    assert claim["status"] == "decided"
    assert claim["decision"] == "approve"
    assert claim["payout"] == 420.0
    assert claim["reason"] == "The delay is covered."
    assert claim["policy_section"] == "Section 3, Trip Delay"
    assert claim["decided_at"]
    paid = pay(client, 420.0)
    assert paid.status_code == 200
    assert paid.json()["paid_amount"] == 420.0
    assert paid.json()["paid_at"]
    again = pay(client, 420.0)
    assert again.status_code == 409
    assert again.json() == {"detail": "Claim CLM-1001 is already paid"}


def test_pay_must_match_the_payout(client):
    start(client)
    decide(client)
    response = pay(client, 500.0)
    assert response.status_code == 409
    assert response.json() == {"detail": "The approved payout for CLM-1001 is $420.00"}


def test_payment_over_the_limit_waits_for_sign_off(client):
    start(client)
    claim = decide(client, payout=1250.0).json()
    assert claim["status"] == "awaiting_sign_off"
    response = pay(client, 1250.0)
    assert response.status_code == 403
    assert response.json() == {
        "detail": "A payout over $1,000.00 needs a handler's sign-off "
        "before it can be paid"
    }
    assert client.get("/api/claims/CLM-1001").json()["paid_amount"] is None


def test_sign_off_pays(client):
    start(client)
    decide(client, payout=1250.0)
    claim = sign_off(client).json()
    assert claim["status"] == "decided"
    assert claim["signed_off_by"] == "HND-01"
    assert claim["signed_off_at"]
    assert claim["paid_amount"] == 1250.0
    assert pay(client, 1250.0).status_code == 409


def test_sign_off_with_unknown_handler(client):
    start(client)
    decide(client, payout=1250.0)
    response = sign_off(client, "HND-99")
    assert response.status_code == 404
    assert response.json() == {"detail": "Handler HND-99 not found"}


def test_sign_off_needs_a_held_claim(client):
    start(client)
    decide(client)
    assert sign_off(client).status_code == 409


def test_exactly_the_limit_needs_no_sign_off(client):
    start(client)
    assert decide(client, payout=1000.0).json()["status"] == "decided"
    assert pay(client, 1000.0).json()["paid_amount"] == 1000.0


@pytest.mark.parametrize("decision", ["decline", "refer"])
def test_no_payout_unless_approved(client, decision):
    start(client)
    assert decide(client, decision, 100.0).status_code == 422
    claim = decide(client, decision, 0).json()
    assert claim["status"] == "decided"
    assert claim["decision"] == decision
    response = pay(client, 0)
    assert response.status_code == 409
    assert response.json() == {"detail": "Claim CLM-1001 is not approved"}


def test_a_decided_claim_is_final(client):
    start(client)
    decide(client)
    assert decide(client, "decline", 0).status_code == 409
