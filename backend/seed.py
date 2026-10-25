"""Build the database from data/, replacing what is there."""

import json
from contextlib import closing
from pathlib import Path
from typing import Any

from backend import db

DATA = Path(__file__).parent.parent / "data"


def read(name: str) -> Any:
    """Read one JSON file from data/."""
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def seed() -> dict[str, int]:
    """Rebuild the database from data/ and return the count of each record."""
    claims = read("claims.json")
    policies = read("policies.json")
    customers = read("customers.json")
    plans = read("plans.json")["plans"]
    handlers = read("handlers.json")
    db.path().unlink(missing_ok=True)
    with closing(db.connect()) as connection, connection:
        connection.executescript(db.SCHEMA)
        connection.executemany(
            "INSERT INTO claims (claim_id, policy_id, customer_id, data, status) "
            "VALUES (?, ?, ?, ?, 'waiting')",
            [
                (c["claim_id"], c["policy_id"], c["customer_id"], json.dumps(c))
                for c in claims
            ],
        )
        connection.executemany(
            "INSERT INTO policies VALUES (?, ?)",
            [(p["policy_id"], json.dumps(p)) for p in policies],
        )
        connection.executemany(
            "INSERT INTO customers VALUES (?, ?)",
            [(c["customer_id"], json.dumps(c)) for c in customers],
        )
        connection.executemany(
            "INSERT INTO plans VALUES (?, ?)",
            [(p["plan"], json.dumps(p)) for p in plans],
        )
        connection.executemany(
            "INSERT INTO handlers VALUES (?, ?)",
            [(h["handler_id"], json.dumps(h)) for h in handlers],
        )
        connection.execute(
            "INSERT INTO company VALUES (1, ?)", (json.dumps(read("company.json")),)
        )
    return {
        "claims": len(claims),
        "policies": len(policies),
        "customers": len(customers),
        "plans": len(plans),
        "handlers": len(handlers),
    }


if __name__ == "__main__":
    counts = seed()
    print("Seeded " + ", ".join(f"{n} {name}" for name, n in counts.items()))
