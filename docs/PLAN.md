# Plan: the claims pilot

This plan builds the pilot in `docs/SPEC.md`: a backend that holds UnderCover's claims, the UnderCover Agent that decides them through the backend's API, and a dashboard where the claims team watches the queue, reads each claim and the agent's work, and signs off large payouts.

The work is in six phases. Each builds on the last and ends with its checks passing and a commit.

## How it fits together

```
data/*.json, *.md ──seed──▶ SQLite ◀── FastAPI backend (/api/...) ◀── dashboard (React, polls every 2 s)
                                                 ▲
                                                 └── UnderCover Agent (uv run -m agent), tools call the API
```

- **The backend is the only thing that touches the database.** The agent and the dashboard both work through the API, so the rules live in one place and the backend can enforce them, whatever the agent does.
- **The agent runs from the command line.** `uv run -m agent` works every waiting claim in turn and `uv run -m agent CLM-1001` works one. The spec doesn't ask for starting the agent from the dashboard, so the pilot doesn't build that.
- **The dashboard shows progress by polling.** It asks the backend for the queue and the claim's steps every 2 seconds. That's the simplest way to show the agent working live, and it doesn't need websockets.

## Key decisions

### Data

- `uv run -m backend.seed` builds the database from `data/` and resets it to the starting queue. Starting the backend with no database builds it too, so `npm run dev` works the first time.
- The database file is `backend/undercover.db` (already ignored by git through `*.db`). The environment variable `UNDERCOVER_DB` points it somewhere else, which the tests and the end-to-end run use.
- The seed reads only `claims.json`, `policies.json`, `customers.json`, `plans.json`, `handlers.json` and `company.json`. It never reads `data/evals/` or `data/security/`, so neither the queue nor the agent can see them. The 25 claims start as `waiting`.
- Tables:
  - `claims`: the claim as it came in (JSON), plus the workflow columns `status`, `decision`, `payout`, `reason`, `policy_section`, `decided_at`, `signed_off_by`, `signed_off_at`, `paid_amount` and `paid_at`.
  - `policies`, `customers`, `plans` and `handlers`: one row per record, keyed by its id, with the record as JSON.
  - `company`: one row with the company settings, including the $1,000 `payout_approval_limit`. The backend reads the limit from here and doesn't hard-code it.
  - `steps`: the agent's steps on each claim, in order.
- The policy wording is served straight from `data/policy_wording.md`. The agent's instructions live in `backend/instructions.md`, because the agent gets them only through the API.
- The SQLite access uses Python's built-in `sqlite3`, with no ORM. For this size of data, that's the simplest choice.

### The claim's journey

| Status | Label on screen | How a claim gets here |
|---|---|---|
| `waiting` | Waiting | Seeded |
| `in_progress` | In progress | The agent starts work on it |
| `awaiting_sign_off` | Waiting for sign-off | The agent approves a payout over $1,000 |
| `decided` | Decided | The agent declines, refers, or approves $1,000 or less; or a handler signs off |

- A referral counts as a decision, because the spec lists refer next to approve and decline. Its payout is $0.
- A decided claim is final. To run the queue again, reseed.
- "Over $1,000" means more than $1,000.00. A payout of exactly $1,000.00 doesn't need sign-off.

### The payment rule

Paying is its own operation that takes the amount, as `docs/TECH_STACK.md` asks. The backend refuses a payment unless:

1. the claim is approved,
2. the amount equals the approved payout, to the cent,
3. the claim hasn't been paid yet, and
4. the payout is $1,000 or less, or a handler has signed off.

If the agent tries to pay more than $1,000 before sign-off, it gets a 403 and nothing is paid. A handler's sign-off records who signed off and when, then pays the approved payout itself.

### API

Every operation has an `operation_id`, a one-line docstring and no optional inputs. A test walks the OpenAPI schema to check all three.

| Operation | Method and path | Used by |
|---|---|---|
| `health` | `GET /api/health` | dashboard |
| `list_claims` | `GET /api/claims` | dashboard, agent runner |
| `get_claim` | `GET /api/claims/{claim_id}` | dashboard, agent |
| `get_policy` | `GET /api/policies/{policy_id}` (the policy and its plan's limits) | dashboard, agent |
| `get_customer` | `GET /api/customers/{customer_id}` (with claim history) | dashboard, agent |
| `list_handlers` | `GET /api/handlers` | dashboard |
| `get_policy_wording` | `GET /api/policy-wording` | dashboard, agent |
| `get_instructions` | `GET /api/instructions` | dashboard, agent |
| `start_claim` | `POST /api/claims/{claim_id}/start` | agent |
| `add_step` | `POST /api/claims/{claim_id}/steps` with `kind`, `title`, `detail` | agent |
| `list_steps` | `GET /api/claims/{claim_id}/steps` | dashboard |
| `decide_claim` | `POST /api/claims/{claim_id}/decision` with `decision`, `payout`, `reason`, `policy_section` | agent |
| `pay_claim` | `POST /api/claims/{claim_id}/payment` with `amount` | agent |
| `sign_off_claim` | `POST /api/claims/{claim_id}/sign-off` with `handler_id` | dashboard |

Errors: 404 for an unknown id, 409 for the wrong status (for example, deciding a claim twice), 403 for a payment that needs sign-off, and 422 for a bad request (for example, a decline with a payout above $0).

### The agent

- It keeps the skeleton's `create_agent` on OpenRouter and its `model()`: `openai/gpt-6-luna` at low reasoning effort, or `MODEL_NAME` when set.
- `run(claim_id, thread_id)` fetches its instructions from `GET /api/instructions`, starts the claim, then streams the agent's updates. For each one it posts a step to the backend: a model message, a tool call (a plain title such as "Read policy POL-2001", with the arguments as detail) or a tool result (a short title, with the full result as detail). The runner records the steps, not the model, so the record is complete whatever the model does.
- Tools, each a thin call to the API:
  - `get_claim(claim_id)`
  - `get_policy(policy_id)`
  - `get_claim_history(customer_id)`: the customer's name and earlier claims only. The agent doesn't need their address, phone or date of birth.
  - `get_policy_wording()`
  - `decide_claim(claim_id, decision, payout, reason, policy_section)`
  - `pay_claim(claim_id, amount)`
- When the backend refuses a call, the tool returns the backend's message to the model instead of raising, so the agent can read it and finish.
- The agent code never imports from `backend/`. Only its tests do, to run the backend in-process.
- The instructions tell the agent to:
  - read the claim, the policy, the claim history and the wording
  - check the trip dates, the 90-day filing window, the benefit for the claim type, waiting periods, exclusions and the documents the wording asks for
  - approve, decline, or refer when the claim needs judgment or more information, such as a missing document (section 11)
  - work out the payout by section 10: item limits, money already paid by others, the deductible where it applies, and the benefit maximum
  - record the decision with a reason of two or three sentences and the section, such as "Section 3, Trip Delay"
  - pay approved payouts of $1,000 or less, and leave larger ones for a handler's sign-off

  The instructions don't mention the claims manual, which is out of scope for the pilot.

### The dashboard

- It has three pages and uses hash routing (`#/`, `#/claims/CLM-1001`, `#/instructions`). That's a few lines of code, with no router package.
- `dashboard/src/api.ts` holds typed fetch functions and types that match the backend's responses, in strict TypeScript with no `any`.
- It follows `docs/BRAND.md`:
  - Fonts: Instrument Sans, Instrument Serif for the tagline, and JetBrains Mono for ids and amounts.
  - Status colors: Waiting in Cerulean, In progress in Marigold, Waiting for sign-off in Coral, Decided in Sea Green.
  - Light and dark modes that follow the system setting, with rounded panels and no outlines.
  - Money shown as $1,250.00, and dates as Jun 24, 2026.

### Tests and the end-to-end run

- **pytest:** each test gets a fresh, seeded database in a temp folder through `UNDERCOVER_DB`. The backend tests use FastAPI's `TestClient`. The agent tests use the skeleton's `StubModel` with scripted tool calls against the in-process backend, so no test calls a model.
- **vitest:** components are tested with Testing Library, with `fetch` stubbed.
- **Playwright:** the end-to-end run gets its own backend on port 8001, with a freshly seeded database at `e2e/undercover-e2e.db`, and its own Vite on port 5174 that proxies to it. That way `npm run check` never changes the queue in a `npm run dev` that's running on 8000 and 5173. The tests stand in for the agent by calling its API operations (start, steps, decision), so they need no model either.
- **Browser checks:** these use the Playwright MCP server, on the dev servers.

## Phase 1: the backend's data and read API

**Builds:**
- `backend/db.py`: the connection and the schema
- `backend/seed.py`: `uv run -m backend.seed`
- `backend/models.py`: the response models
- the read operations: `list_claims`, `get_claim`, `get_policy`, `get_customer`, `list_handlers` and `get_policy_wording`
- building the database on startup when it's missing
- the shared pytest fixture
- the test that checks the API's conventions

**Why first:** everything else reads from these records.

- [x] `uv run -m backend.seed` prints `Seeded 25 claims, 50 policies, 49 customers, 3 plans, 3 handlers`
- [x] With `npm run dev` running, `curl -s localhost:8000/api/claims` returns 25 claims, each with `claim_id`, `customer_name`, `claim_type`, `summary`, `amount_claimed`, `submitted_on` and `status` `"waiting"`
- [x] `GET /api/claims/CLM-1001` returns the story, 3 items, 4 documents, `amount_claimed` 420.0, status `waiting` and a null decision
- [x] `GET /api/claims/CLM-9999` returns 404
- [x] `GET /api/policies/POL-2001` returns plan `premium` with its limits, including `deductible` 50.0 and `trip_delay_max` 800.0
- [x] `GET /api/customers/CUS-3001` returns Maya Patel with earlier claim `CLM-0412`
- [x] `GET /api/handlers` returns HND-01, HND-02 and HND-03
- [x] `GET /api/policy-wording` returns content that starts `# UnderCover Travel Insurance: Policy Wording`
- [x] After deleting `backend/undercover.db`, starting the backend builds a seeded database again
- [x] A pytest test confirms that every operation has an `operation_id`, a one-line docstring and no optional inputs
- [x] `grep -rn "evals" backend agent` finds nothing
- [x] `npm run check:python` passes, with coverage at or above 80%

## Phase 2: the claim workflow and the payment rule

**Builds:** `start_claim`, `add_step`, `list_steps`, `decide_claim`, `pay_claim` and `sign_off_claim`, with the status changes and the payment rule above, and a test for every rule.

**Why now:** the $1,000 rule is the spec's hard rule. Building it in the backend, before the agent exists, means the agent can't get around it.

- [x] Starting `CLM-1001` moves it to `in_progress`, and starting it again returns 409
- [x] Two posted steps come back from `list_steps` in order, with their `kind`, `title`, `detail` and time
- [x] Deciding a `waiting` claim returns 409; only `in_progress` claims can be decided
- [x] Approving $420.00 moves the claim to `decided`. Paying $420.00 sets `paid_amount` to 420.0, and paying again returns 409
- [x] Paying an amount that differs from the approved payout returns 409
- [x] Approving $1,250.00 moves the claim to `awaiting_sign_off`. Paying $1,250.00 then returns 403 with a message that it needs a handler's sign-off, and `paid_amount` stays null
- [x] Signing off as `HND-01` moves the claim to `decided`, records `signed_off_by` `HND-01` and the time, and sets `paid_amount` to 1250.0
- [x] Signing off with an unknown handler returns 404, and signing off a claim that isn't waiting for sign-off returns 409
- [x] Approving exactly $1,000.00 moves the claim to `decided`, and it can be paid without sign-off
- [x] Declining or referring with a payout above $0 returns 422, and paying a declined or referred claim returns 409
- [x] Deciding a claim that's already decided returns 409
- [x] `npm run check:python` passes, with coverage at or above 80%

## Phase 3: the UnderCover Agent

**Builds:**
- `backend/instructions.md` and `get_instructions`
- the agent's six tools
- `run(claim_id, thread_id)`, with step recording
- `agent/__main__.py` for `uv run -m agent` and `uv run -m agent <claim_id>`, which prints one line per claim with its decision and payout

**Why now:** the backend's workflow is in place, so the agent only has to read, decide and call it.

- [x] `GET /api/instructions` returns the text of `backend/instructions.md`
- [x] Each tool, run against the in-process backend, returns the expected data, and `get_claim_history` leaves out the address, phone and date of birth
- [x] Stub-model test, approval under the limit: the agent reads the claim, policy, history and wording, approves $420.00 and pays it. The claim ends `decided`, paid $420.00, with tool call, tool result and message steps recorded
- [x] Stub-model test, approval over the limit: the agent approves $1,250.00 and then tries to pay. The payment is refused, the claim ends `awaiting_sign_off` and unpaid, and the refusal is in the steps
- [x] Stub-model tests, decline and refer: each claim ends `decided` with payout $0 and no payment
- [x] A test shows `run()` uses the instructions from the API as its system prompt
- [x] A test of `agent/__main__.py`, with `run` stubbed, shows it works only the `waiting` claims, or the one claim named
- [x] `grep -rn "from backend\|import backend" agent --include=*.py | grep -v /tests/` finds nothing
- [x] `npm run check:python` passes, with coverage at or above 80%

## Phase 4: the dashboard's base and the queue

**Builds:**
- the brand styles (fonts, color tokens, light and dark)
- the layout with navigation and the hash routing
- `api.ts`, and the formatting for money, dates and statuses
- a polling hook
- the queue page: counts by status, and a table of claims, each linking to its page
- the isolated end-to-end setup (ports 8001 and 5174, a fresh database), with the skeleton's health test replaced by a queue test

**Why now:** the API is complete, and the queue is the handlers' main screen.

- [x] In the browser (Playwright MCP) at `localhost:5173`, the queue shows 25 rows. Each row has the claim id, customer, type, amount claimed (such as $420.00), submitted date and a status badge in the brand color
- [x] The counts read Waiting 25, In progress 0, Waiting for sign-off 0, Decided 0
- [x] After `curl -X POST localhost:8000/api/claims/CLM-1001/start`, CLM-1001's badge changes to In progress and the counts update within 3 seconds, without reloading
- [x] Clicking CLM-1001 goes to `#/claims/CLM-1001`
- [x] With the backend stopped, the page says it can't reach the backend
- [x] Screenshots in light and dark mode match `docs/BRAND.md`: the fonts, panels with no outline, and no single-edge borders or top-of-page lines
- [x] `npm run e2e` passes, and the dev database is unchanged afterwards (`GET /api/claims` on port 8000 shows the same statuses as before)
- [x] `npm run check:ts` passes, with vitest coverage at or above 80%

## Phase 5: the claim page and the instructions page

**Builds:**
- the claim page:
  - the claim in full: summary, story, incident date and place, submitted date, items with their total, and documents
  - the policy: plan, add-ons, trip dates, trip cost and travelers
  - the customer and their claim history
  - the decision, with its payout, reason, policy section and payment status
  - the sign-off panel (choose a handler, then "Sign off and pay")
  - the agent's steps, updating live, with each step's detail behind a "Show details" toggle
- the read-only instructions page
- the end-to-end tests for both pages

**Why now:** it completes what the spec says the team needs to see.

- [x] In the browser, `#/claims/CLM-1001` shows the story, the 3 items totaling $420.00, the 4 documents, the Premium plan with its trip dates, and Maya Patel's earlier claim CLM-0412
- [x] Posting steps to CLM-1001 with curl makes them appear on its page, in order, within 3 seconds
- [x] After a decision is posted with curl, the page shows the decision, the payout, the reason, the policy section and whether it's paid
- [x] For a claim waiting for sign-off, the page shows the sign-off panel with the three handlers. Signing off as Dana Whitfield shows "Signed off by Dana Whitfield" and "Paid $1,250.00", and the queue shows it as Decided
- [x] `#/claims/CLM-9999` says the claim wasn't found
- [x] `#/instructions` shows the agent's instructions, with no text box or edit control
- [x] End-to-end test: standing in for the agent through the API (start, two steps, approve $1,250.00), the test sees the steps and Waiting for sign-off on the claim page, signs off in the page and sees Paid $1,250.00
- [x] End-to-end test: the instructions page shows the instructions
- [x] `npm run check:ts` and `npm run e2e` pass

## Phase 6: the pilot with a real model, and the hand-over

**Builds:** no new features. This phase runs the agent on a real model with the dashboard open, fixes whatever that shows, updates `docs/STATUS.md` with what's built and how to run it, and runs every check.

**Why last:** it proves the pieces work together, with a real model, the way the claims team will use them.

This is the only phase that spends API money: one claim, then the 25-claim queue on GPT-6 Luna at low reasoning. If you'd rather keep the cost down, tell me to run only one claim, or set `MODEL_NAME=openrouter/free` in `.env`.

- [ ] After `uv run -m backend.seed`, with `npm run dev` running, `uv run -m agent CLM-1001` moves CLM-1001 through In progress to Decided in the browser. Its steps appear while it works, and its decision has a reason of two or three sentences and a policy section
- [ ] `uv run -m agent` works the rest of the queue and prints one line per claim. Afterwards no claim is `waiting` or `in_progress`
- [ ] Through the API, every approved claim with a payout over $1,000 is `awaiting_sign_off` with `paid_amount` null, and every approved claim of $1,000 or less is paid
- [ ] Signing off one held claim in the dashboard pays it, and it shows as Decided
- [ ] `docs/STATUS.md` describes the backend, agent, dashboard and tests, and how to run them: `npm run dev`, `uv run -m agent`, `uv run -m backend.seed` and `npm run check`
- [ ] `npm run check` passes in full

## Not in this plan

These are left out on purpose:
- The claims manual
- Sign-in
- Real payments
- Messages to customers
- Starting the agent from the dashboard
- Scoring the agent against `data/evals/`

They are either out of scope in the spec or come with later briefs.
