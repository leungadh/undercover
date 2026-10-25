# Status

The pilot is being built from `docs/PLAN.md`. Done so far: Phases 1 and 2.

## Built

- `backend/`: FastAPI and SQLite.
  - `uv run -m backend.seed` rebuilds `backend/undercover.db` from `data/`, with the 25 claims waiting. The backend builds the database on startup when it's missing. `UNDERCOVER_DB` points it at another file.
  - Read operations: `list_claims`, `get_claim`, `get_policy` (with its plan's limits), `get_customer`, `list_handlers`, `get_policy_wording` and `health`.
  - The claim workflow: `start_claim`, `add_step`, `list_steps`, `decide_claim`, `pay_claim` and `sign_off_claim`. A claim goes waiting, in progress, then decided, or waiting for sign-off when an approval pays over $1,000.
  - The payment rule: the backend pays only an approved, unpaid claim its exact payout, and refuses (403) a payout over $1,000 until a handler signs off. The sign-off pays it.
- `agent/`: still the skeleton, with the entry point `run(claim_id, thread_id)` and one tool that calls the health route.
- `dashboard/`: still the skeleton, with one page that shows whether the backend is up.
- `e2e/`: one test of that page.

## Run it

- `npm run dev` starts the backend on port 8000 and the dashboard on port 5173.
- `uv run -m backend.seed` resets the queue.
- `npm run check` runs every check.
