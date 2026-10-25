"""Work the queue: `uv run -m agent`, or one claim: `uv run -m agent CLM-1001`."""

import sys
from uuid import uuid4

from agent.main import request, run


def main(claim_ids: list[str]) -> None:
    """Work the named claims, or every waiting claim, and print each outcome."""
    if not claim_ids:
        claims = request("GET", "/api/claims").json()
        claim_ids = [c["claim_id"] for c in claims if c["status"] == "waiting"]
    for claim_id in claim_ids:
        run(claim_id, str(uuid4()))
        claim = request("GET", f"/api/claims/{claim_id}").json()
        payout = "" if claim["payout"] is None else f" ${claim['payout']:,.2f}"
        decision = claim["decision"] or "no decision"
        print(f"{claim_id}: {decision}{payout} ({claim['status']})")


if __name__ == "__main__":
    main(sys.argv[1:])
