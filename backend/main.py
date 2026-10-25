"""The UnderCover backend."""

import json
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException

from backend import db
from backend.models import (
    Claim,
    ClaimSummary,
    Customer,
    Decision,
    Handler,
    NewStep,
    Payment,
    Policy,
    SignOff,
    Step,
    Text,
)
from backend.seed import DATA, seed


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    if not db.path().exists():
        seed()
    yield


app = FastAPI(title="UnderCover", lifespan=lifespan)

Db = Annotated[sqlite3.Connection, Depends(db.database)]


def found(row: sqlite3.Row | None, what: str) -> sqlite3.Row:
    """Return the row, or raise a 404 naming what was not found."""
    if row is None:
        raise HTTPException(404, f"{what} not found")
    return row


def data(row: sqlite3.Row | None, what: str) -> dict[str, Any]:
    """Return the JSON record held in a row's data column."""
    return json.loads(found(row, what)["data"])


def claim_row(connection: sqlite3.Connection, claim_id: str) -> sqlite3.Row:
    """Return a claim's row, or raise a 404."""
    row = connection.execute(
        "SELECT * FROM claims WHERE claim_id = ?", (claim_id,)
    ).fetchone()
    return found(row, f"Claim {claim_id}")


def claim_record(row: sqlite3.Row) -> dict[str, Any]:
    """Merge a claim as it came in with where it stands now."""
    return json.loads(row["data"]) | dict(row)


def require_status(row: sqlite3.Row, status: str) -> None:
    """Raise a 409 unless the claim has the given status."""
    if row["status"] != status:
        raise HTTPException(
            409, f"Claim {row['claim_id']} is {row['status']}, not {status}"
        )


def approval_limit(connection: sqlite3.Connection) -> float:
    """Return the payout above which a handler must sign off."""
    company = connection.execute("SELECT data FROM company").fetchone()
    return json.loads(company["data"])["payout_approval_limit"]


def now() -> str:
    """Return the time now in UTC, to the second."""
    return datetime.now(UTC).isoformat(timespec="seconds")


def money(amount: float) -> str:
    """Format an amount in US dollars, such as $1,250.00."""
    return f"${amount:,.2f}"


@app.get("/api/health", operation_id="health")
def health() -> dict[str, str]:
    """Check that the backend is running."""
    return {"status": "ok"}


@app.get("/api/claims", operation_id="list_claims")
def list_claims(connection: Db) -> list[ClaimSummary]:
    """List the claims queue with where each claim stands."""
    rows = connection.execute(
        "SELECT claims.*, json_extract(customers.data, '$.name') AS customer_name "
        "FROM claims JOIN customers USING (customer_id) ORDER BY claim_id"
    ).fetchall()
    return [ClaimSummary.model_validate(claim_record(row)) for row in rows]


@app.get("/api/claims/{claim_id}", operation_id="get_claim")
def get_claim(claim_id: str, connection: Db) -> Claim:
    """Get one claim in full, with its decision and payment."""
    return Claim.model_validate(claim_record(claim_row(connection, claim_id)))


@app.get("/api/policies/{policy_id}", operation_id="get_policy")
def get_policy(policy_id: str, connection: Db) -> Policy:
    """Get a policy with the limits of its plan."""
    policy = data(
        connection.execute(
            "SELECT data FROM policies WHERE policy_id = ?", (policy_id,)
        ).fetchone(),
        f"Policy {policy_id}",
    )
    plan = data(
        connection.execute(
            "SELECT data FROM plans WHERE plan = ?", (policy["plan"],)
        ).fetchone(),
        f"Plan {policy['plan']}",
    )
    return Policy.model_validate(policy | {"plan_details": plan})


@app.get("/api/customers/{customer_id}", operation_id="get_customer")
def get_customer(customer_id: str, connection: Db) -> Customer:
    """Get a customer with their claim history."""
    row = connection.execute(
        "SELECT data FROM customers WHERE customer_id = ?", (customer_id,)
    ).fetchone()
    return Customer.model_validate(data(row, f"Customer {customer_id}"))


@app.get("/api/handlers", operation_id="list_handlers")
def list_handlers(connection: Db) -> list[Handler]:
    """List the claims handlers."""
    rows = connection.execute("SELECT data FROM handlers ORDER BY handler_id")
    return [Handler.model_validate_json(row["data"]) for row in rows]


@app.get("/api/policy-wording", operation_id="get_policy_wording")
def get_policy_wording() -> Text:
    """Get the policy wording that decisions follow."""
    return Text(content=(DATA / "policy_wording.md").read_text(encoding="utf-8"))


@app.post("/api/claims/{claim_id}/start", operation_id="start_claim")
def start_claim(claim_id: str, connection: Db) -> Claim:
    """Start work on a waiting claim."""
    require_status(claim_row(connection, claim_id), "waiting")
    connection.execute(
        "UPDATE claims SET status = 'in_progress' WHERE claim_id = ?", (claim_id,)
    )
    return get_claim(claim_id, connection)


@app.post("/api/claims/{claim_id}/steps", operation_id="add_step")
def add_step(claim_id: str, step: NewStep, connection: Db) -> Step:
    """Record a step the agent took on a claim."""
    claim_row(connection, claim_id)
    row = connection.execute(
        "INSERT INTO steps (claim_id, kind, title, detail, created_at) "
        "VALUES (?, ?, ?, ?, ?) RETURNING *",
        (claim_id, step.kind, step.title, step.detail, now()),
    ).fetchone()
    return Step.model_validate(dict(row))


@app.get("/api/claims/{claim_id}/steps", operation_id="list_steps")
def list_steps(claim_id: str, connection: Db) -> list[Step]:
    """List the agent's steps on a claim, in order."""
    claim_row(connection, claim_id)
    rows = connection.execute(
        "SELECT * FROM steps WHERE claim_id = ? ORDER BY step_id", (claim_id,)
    )
    return [Step.model_validate(dict(row)) for row in rows]


@app.post("/api/claims/{claim_id}/decision", operation_id="decide_claim")
def decide_claim(claim_id: str, decision: Decision, connection: Db) -> Claim:
    """Record the decision on a claim in progress."""
    require_status(claim_row(connection, claim_id), "in_progress")
    held = decision.decision == "approve" and decision.payout > approval_limit(
        connection
    )
    connection.execute(
        "UPDATE claims SET status = ?, decision = ?, payout = ?, reason = ?, "
        "policy_section = ?, decided_at = ? WHERE claim_id = ?",
        (
            "awaiting_sign_off" if held else "decided",
            decision.decision,
            round(decision.payout, 2),
            decision.reason,
            decision.policy_section,
            now(),
            claim_id,
        ),
    )
    return get_claim(claim_id, connection)


@app.post("/api/claims/{claim_id}/payment", operation_id="pay_claim")
def pay_claim(claim_id: str, payment: Payment, connection: Db) -> Claim:
    """Pay an approved claim its payout; over the limit, only after sign-off."""
    row = claim_row(connection, claim_id)
    limit = approval_limit(connection)
    if row["decision"] != "approve":
        raise HTTPException(409, f"Claim {claim_id} is not approved")
    if row["paid_amount"] is not None:
        raise HTTPException(409, f"Claim {claim_id} is already paid")
    if row["payout"] > limit and row["signed_off_by"] is None:
        raise HTTPException(
            403,
            f"A payout over {money(limit)} needs a handler's sign-off "
            "before it can be paid",
        )
    if round(payment.amount, 2) != row["payout"]:
        raise HTTPException(
            409, f"The approved payout for {claim_id} is {money(row['payout'])}"
        )
    connection.execute(
        "UPDATE claims SET paid_amount = payout, paid_at = ? WHERE claim_id = ?",
        (now(), claim_id),
    )
    return get_claim(claim_id, connection)


@app.post("/api/claims/{claim_id}/sign-off", operation_id="sign_off_claim")
def sign_off_claim(claim_id: str, sign_off: SignOff, connection: Db) -> Claim:
    """Sign off an approval over the limit as a handler, which pays it."""
    row = claim_row(connection, claim_id)
    found(
        connection.execute(
            "SELECT 1 FROM handlers WHERE handler_id = ?", (sign_off.handler_id,)
        ).fetchone(),
        f"Handler {sign_off.handler_id}",
    )
    require_status(row, "awaiting_sign_off")
    signed_off_at = now()
    connection.execute(
        "UPDATE claims SET status = 'decided', signed_off_by = ?, signed_off_at = ?, "
        "paid_amount = payout, paid_at = ? WHERE claim_id = ?",
        (sign_off.handler_id, signed_off_at, signed_off_at, claim_id),
    )
    return get_claim(claim_id, connection)
