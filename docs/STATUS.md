# Status

The pilot from `docs/PLAN.md` is built. Phase 6's runs with a real model are still to do: they need `OPENROUTER_API_KEY` in `.env`.

## Built

- `backend/`: FastAPI and SQLite.
  - `uv run -m backend.seed` rebuilds `backend/undercover.db` from `data/`, with the 25 claims waiting. The backend builds the database on startup when it's missing. `UNDERCOVER_DB` points it at another file. Nothing reads `data/evals/` or `data/security/`.
  - Read operations: `list_claims`, `get_claim`, `get_policy` (with its plan's limits), `get_customer`, `list_handlers`, `get_policy_wording`, `get_instructions` and `health`.
  - The claim workflow: `start_claim`, `add_step`, `list_steps`, `decide_claim`, `pay_claim` and `sign_off_claim`. A claim goes waiting, in progress, then decided, or waiting for sign-off when an approval pays over $1,000. A referral is a decision, with a $0 payout.
  - The payment rule: the backend pays only an approved, unpaid claim its exact payout, and refuses (403) a payout over $1,000 until a handler signs off. The sign-off pays it.
  - The agent's instructions are in `backend/instructions.md`.
- `agent/`: the UnderCover Agent, LangChain's `create_agent` on OpenRouter (`openai/gpt-6-luna` at low reasoning, or `MODEL_NAME`).
  - `run(claim_id, thread_id)` fetches its instructions from the API, starts the claim and records every model message, tool call and tool result as a step.
  - Tools, each a call to the API: `get_claim`, `get_policy`, `get_claim_history` (name and earlier claims only), `get_policy_wording`, `decide_claim` and `pay_claim`.
  - `uv run -m agent` works every waiting claim; `uv run -m agent CLM-1001` works one.
- `dashboard/`: React, Vite and TypeScript, in the UnderCover brand with light and dark modes.
  - The queue (`#/`): counts by status and every claim with its customer, type, amount, submitted date, status and decision. It refreshes every 2 seconds.
  - A claim's page (`#/claims/<id>`):
    - the decision with its reason, policy section and payment
    - the sign-off for an approval over $1,000 (choose a handler, then Sign off and pay)
    - the claim in full, with its items and documents
    - the agent's steps, updating live
    - the policy with its plan's limits
    - the customer with their claim history
  - The agent's instructions (`#/instructions`), read only.
- `e2e/`: Playwright tests of the queue, a claim's page, the sign-off and the instructions. They run their own backend on port 8001 with a fresh database (`e2e/undercover-e2e.db`) and their own dashboard on port 5174, so they never change the dev queue. The sign-off test stands in for the agent through its API operations.

## Run it

- Put `OPENROUTER_API_KEY=...` in `.env`, and optionally `MODEL_NAME=openrouter/free`.
- `npm run dev` starts the backend on port 8000 and the dashboard at http://localhost:5173.
- `uv run -m agent` works the queue, or `uv run -m agent CLM-1001` works one claim. The backend must be running.
- `uv run -m backend.seed` resets the queue. A decided claim is final, so a rerun needs a reseed.
- `npm run check` runs every check.

## Known limits

- If the agent stops partway through a claim, for example on a network error, the claim stays in progress until you reseed.
- The agent works from the policy wording alone. The claims manual is out of scope for the pilot.
