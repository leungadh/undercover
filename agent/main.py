"""The UnderCover Agent."""

import json
import os
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolCall, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

load_dotenv(override=True)

BACKEND_URL = "http://localhost:8000"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-6-luna"
REFUSED = "The backend refused: "

CALL_TITLES = {
    "get_claim": "Read claim {claim_id}",
    "get_policy": "Read policy {policy_id}",
    "get_claim_history": "Read the claim history of {customer_id}",
    "get_policy_wording": "Read the policy wording",
    "decide_claim": "Decide to {decision} with a payout of ${payout:,.2f}",
    "pay_claim": "Pay ${amount:,.2f}",
}
RESULT_TITLES = {
    "get_claim": "Got the claim",
    "get_policy": "Got the policy",
    "get_claim_history": "Got the claim history",
    "get_policy_wording": "Got the policy wording",
    "decide_claim": "Decision recorded",
    "pay_claim": "Payment made",
}


def backend() -> httpx.Client:
    """Return a client for the UnderCover backend."""
    return httpx.Client(base_url=BACKEND_URL, timeout=10)


def request(
    method: str, path: str, body: dict[str, Any] | None = None
) -> httpx.Response:
    """Call the backend."""
    with backend() as client:
        return client.request(method, path, json=body)


def reply(response: httpx.Response) -> str:
    """Return the backend's reply for the model, or why it refused."""
    if response.is_error:
        return REFUSED + str(response.json()["detail"])
    return response.text


@tool
def get_claim(claim_id: str) -> str:
    """Get a claim: the customer's story, the items claimed and the documents."""
    return reply(request("GET", f"/api/claims/{claim_id}"))


@tool
def get_policy(policy_id: str) -> str:
    """Get a policy: its plan and the plan's limits, add-ons, trip and travelers."""
    return reply(request("GET", f"/api/policies/{policy_id}"))


@tool
def get_claim_history(customer_id: str) -> str:
    """Get a customer's name and their earlier claims with UnderCover."""
    response = request("GET", f"/api/customers/{customer_id}")
    if response.is_error:
        return reply(response)
    customer = response.json()
    return json.dumps(
        {"name": customer["name"], "previous_claims": customer["previous_claims"]}
    )


@tool
def get_policy_wording() -> str:
    """Get the policy wording, which every decision follows."""
    return request("GET", "/api/policy-wording").json()["content"]


@tool
def decide_claim(
    claim_id: str,
    decision: Literal["approve", "decline", "refer"],
    payout: float,
    reason: str,
    policy_section: str,
) -> str:
    """Record the decision on a claim, with the payout (0 unless approved), a reason
    of two or three sentences and the section of the policy wording it rests on."""
    return reply(
        request(
            "POST",
            f"/api/claims/{claim_id}/decision",
            {
                "decision": decision,
                "payout": payout,
                "reason": reason,
                "policy_section": policy_section,
            },
        )
    )


@tool
def pay_claim(claim_id: str, amount: float) -> str:
    """Pay an approved claim exactly its payout."""
    return reply(request("POST", f"/api/claims/{claim_id}/payment", {"amount": amount}))


TOOLS = [
    get_claim,
    get_policy,
    get_claim_history,
    get_policy_wording,
    decide_claim,
    pay_claim,
]


def model() -> ChatOpenAI:
    """Return the model named in MODEL_NAME, or GPT-6 Luna by default."""
    name = os.getenv("MODEL_NAME")
    return ChatOpenAI(
        model=name or DEFAULT_MODEL,
        base_url=OPENROUTER_BASE_URL,
        api_key=SecretStr(os.environ["OPENROUTER_API_KEY"]),
        reasoning_effort=None if name else "low",
    )


def call_title(call: ToolCall) -> str:
    """Describe a tool call in plain words, or by name if its arguments are off."""
    try:
        return CALL_TITLES[call["name"]].format(**call["args"])
    except (KeyError, ValueError):
        return f"Call {call['name']}"


def result_title(message: ToolMessage) -> str:
    """Describe a tool's result in plain words."""
    if message.status == "error":
        return f"Couldn't call {message.name}"
    if message.text.startswith(REFUSED):
        return message.text
    return RESULT_TITLES[str(message.name)]


def steps(message: BaseMessage) -> list[dict[str, str]]:
    """Describe a message from the agent as steps for the dashboard."""
    if isinstance(message, ToolMessage):
        title = result_title(message)
        return [{"kind": "tool_result", "title": title, "detail": message.text}]
    found = []
    if message.text:
        found.append({"kind": "message", "title": message.text, "detail": ""})
    if isinstance(message, AIMessage):
        found += [
            {
                "kind": "tool_call",
                "title": call_title(call),
                "detail": json.dumps(call["args"]),
            }
            for call in message.tool_calls
        ]
    return found


def run(claim_id: str, thread_id: str, llm: BaseChatModel | None = None) -> str:
    """Work one claim, recording each step with the backend, and return the reply."""
    instructions = request("GET", "/api/instructions").json()["content"]
    agent = create_agent(llm or model(), tools=TOOLS, system_prompt=instructions)
    request("POST", f"/api/claims/{claim_id}/start").raise_for_status()
    step_url = f"/api/claims/{claim_id}/steps"
    final = ""
    for update in agent.stream(
        {"messages": [{"role": "user", "content": f"Decide claim {claim_id}."}]},
        config={"configurable": {"thread_id": thread_id}},
        stream_mode="updates",
    ):
        for node in update.values():
            for message in node["messages"]:
                for step in steps(message):
                    request("POST", step_url, step).raise_for_status()
                if isinstance(message, AIMessage):
                    final = message.text
    return final
