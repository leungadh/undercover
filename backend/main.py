"""The UnderCover backend."""

import json
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException

from backend import db
from backend.models import Claim, ClaimSummary, Customer, Handler, Policy, Text
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
