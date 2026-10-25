import json

import pytest
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, ToolCall, ToolMessage

from agent import main


class StubModel(GenericFakeChatModel):
    """A chat model that gives scripted replies in place of a real model."""

    def bind_tools(self, tools, **kwargs):
        return self


def calls(*tool_calls):
    """A scripted reply that calls tools, each given as (name, args)."""
    return AIMessage(
        content="",
        tool_calls=[
            {"name": name, "args": args, "id": f"{name}-{i}"}
            for i, (name, args) in enumerate(tool_calls)
        ],
    )


READ = [
    calls(("get_claim", {"claim_id": "CLM-1001"})),
    calls(
        ("get_policy", {"policy_id": "POL-2001"}),
        ("get_claim_history", {"customer_id": "CUS-3001"}),
        ("get_policy_wording", {}),
    ),
]


def decision(kind, payout):
    return {
        "claim_id": "CLM-1001",
        "decision": kind,
        "payout": payout,
        "reason": "The reason.",
        "policy_section": "Section 3, Trip Delay",
    }


def run(*replies):
    return main.run("CLM-1001", "thread-1", StubModel(messages=iter(replies)))


def titles(client):
    return [s["title"] for s in client.get("/api/claims/CLM-1001/steps").json()]


def test_get_claim():
    claim = json.loads(main.get_claim.invoke({"claim_id": "CLM-1001"}))
    assert claim["story"].startswith("My flight home from Rome")


def test_get_unknown_claim():
    assert main.get_claim.invoke({"claim_id": "CLM-9999"}) == (
        "The backend refused: Claim CLM-9999 not found"
    )


def test_get_policy():
    policy = json.loads(main.get_policy.invoke({"policy_id": "POL-2001"}))
    assert policy["plan_details"]["deductible"] == 50.0


def test_get_claim_history_leaves_out_personal_details():
    history = json.loads(main.get_claim_history.invoke({"customer_id": "CUS-3001"}))
    assert set(history) == {"name", "previous_claims"}
    assert history["previous_claims"][0]["claim_id"] == "CLM-0412"


def test_get_claim_history_of_unknown_customer():
    assert main.get_claim_history.invoke({"customer_id": "CUS-9999"}) == (
        "The backend refused: Customer CUS-9999 not found"
    )


def test_get_policy_wording():
    assert main.get_policy_wording.invoke({}).startswith("# UnderCover Travel")


def test_approve_and_pay_under_the_limit(client):
    reply = run(
        *READ,
        calls(("decide_claim", decision("approve", 420.0))),
        calls(("pay_claim", {"claim_id": "CLM-1001", "amount": 420.0})),
        AIMessage(content="Approved CLM-1001 and paid $420.00."),
    )
    assert reply == "Approved CLM-1001 and paid $420.00."
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["status"] == "decided"
    assert claim["paid_amount"] == 420.0
    steps = client.get("/api/claims/CLM-1001/steps").json()
    assert {s["kind"] for s in steps} == {"tool_call", "tool_result", "message"}
    found = titles(client)
    for title in [
        "Read claim CLM-1001",
        "Got the claim",
        "Read policy POL-2001",
        "Read the claim history of CUS-3001",
        "Read the policy wording",
        "Got the policy wording",
        "Decide to approve with a payout of $420.00",
        "Decision recorded",
        "Pay $420.00",
        "Payment made",
    ]:
        assert title in found
    assert found[-1] == "Approved CLM-1001 and paid $420.00."


def test_payment_over_the_limit_is_refused(client):
    run(
        *READ,
        calls(("decide_claim", decision("approve", 1250.0))),
        calls(("pay_claim", {"claim_id": "CLM-1001", "amount": 1250.0})),
        AIMessage(content="Approved CLM-1001, waiting for sign-off."),
    )
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["status"] == "awaiting_sign_off"
    assert claim["paid_amount"] is None
    assert (
        "The backend refused: A payout over $1,000.00 needs a handler's sign-off "
        "before it can be paid"
    ) in titles(client)


@pytest.mark.parametrize("kind", ["decline", "refer"])
def test_decline_or_refer(client, kind):
    run(
        *READ,
        calls(("decide_claim", decision(kind, 0))),
        AIMessage(content=f"I chose to {kind} CLM-1001."),
    )
    claim = client.get("/api/claims/CLM-1001").json()
    assert claim["status"] == "decided"
    assert claim["decision"] == kind
    assert claim["payout"] == 0
    assert claim["paid_amount"] is None


def test_run_uses_the_instructions_from_the_api(client, monkeypatch):
    prompts = []
    create_agent = main.create_agent

    def spy(llm, tools, system_prompt):
        prompts.append(system_prompt)
        return create_agent(llm, tools=tools, system_prompt=system_prompt)

    monkeypatch.setattr(main, "create_agent", spy)
    run(AIMessage(content="Done."))
    assert prompts == [client.get("/api/instructions").json()["content"]]
    assert prompts[0].startswith("# The UnderCover Agent")


def test_titles_survive_bad_arguments():
    call = ToolCall(name="decide_claim", args={"decision": "approve"}, id="1")
    assert main.call_title(call) == "Call decide_claim"
    call = ToolCall(name="pay_claim", args={"amount": "lots"}, id="2")
    assert main.call_title(call) == "Call pay_claim"


def test_a_failed_tool_call_is_not_a_success():
    message = ToolMessage(
        content="Error: missing payout", tool_call_id="1", name="decide_claim"
    )
    message.status = "error"
    assert main.result_title(message) == "Couldn't call decide_claim"


def test_model_name(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("MODEL_NAME", raising=False)
    assert main.model().model_name == "gpt-6-luna"
    assert main.model().reasoning_effort == "low"
    monkeypatch.setenv("MODEL_NAME", "gpt-5-mini")
    assert main.model().model_name == "gpt-5-mini"


def test_a_missing_key_leaves_the_claim_waiting(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(KeyError):
        main.run("CLM-1001", "thread-1")
    assert client.get("/api/claims/CLM-1001").json()["status"] == "waiting"
