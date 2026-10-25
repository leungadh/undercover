import agent.__main__ as runner


def test_works_only_waiting_claims(client, monkeypatch, capsys):
    worked = []
    monkeypatch.setattr(
        runner, "run", lambda claim_id, thread_id: worked.append(claim_id)
    )
    client.post("/api/claims/CLM-1001/start")
    runner.main([])
    assert len(worked) == 24
    assert "CLM-1001" not in worked
    assert "CLM-1002: no decision (waiting)" in capsys.readouterr().out


def test_works_the_claim_named(client, monkeypatch, capsys):
    def decide(claim_id, thread_id):
        client.post(f"/api/claims/{claim_id}/start")
        client.post(
            f"/api/claims/{claim_id}/decision",
            json={
                "decision": "approve",
                "payout": 1250.0,
                "reason": "Covered.",
                "policy_section": "Section 5",
            },
        )

    monkeypatch.setattr(runner, "run", decide)
    runner.main(["CLM-1005"])
    assert (
        capsys.readouterr().out == "CLM-1005: approve $1,250.00 (awaiting_sign_off)\n"
    )
