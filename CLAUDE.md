# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The course context, the documents in `docs/` to read before touching the product, and how builds are planned and checked are in AGENTS.md:

@AGENTS.md

## Commands

- `uv sync` and `npm install` install everything, including the lefthook pre-commit hook and Playwright's Chromium.
- `npm run dev` starts the backend on port 8000 (uvicorn, reloading on `backend/`) and the dashboard at http://localhost:5173. Vite proxies `/api` to the backend.
- `uv run -m agent` works every waiting claim, and `uv run -m agent CLM-1001` works one. It needs the backend running and `OPENAI_API_KEY` in `.env`, and it spends money.
- `uv run -m backend.seed` resets the queue. A decided claim is final, so a rerun needs a reseed.
- `npm run check` runs everything: `check:python` (ruff format and lint, pyright, pytest at 80% coverage), `check:ts` (prettier, ESLint, tsc, vitest at 80% coverage) and `e2e` (Playwright). The pre-commit hook runs only the Python or TypeScript half for the staged files. Playwright runs only in `npm run check`.
- `npm run format` formats both languages.

Single tests:

- `uv run pytest backend/tests/test_workflow.py::test_sign_off_pays --no-cov`. Without `--no-cov`, the 80% coverage threshold in `pyproject.toml` fails a partial run.
- `npx vitest run --root dashboard src/ClaimPage.test.tsx -t "signs off"`
- `npx playwright test e2e/claim.spec.ts -g "sign-off"`

## Architecture

The backend is the only thing that touches the database. The agent and the dashboard go through the HTTP API, so the business rules live in one place and hold whatever the agent does.

### Backend (`backend/`)

- `db.py` holds the schema. The database is SQLite at `backend/undercover.db`, or the file named in `UNDERCOVER_DB`.
  - Source records (claims, policies, customers, plans, handlers, company) are stored whole as JSON in a `data` column.
  - The `claims` table adds workflow columns: status, decision, payout, sign-off and payment.
- `seed.py` reads only the named files in `data/`, never `data/evals/` or `data/security/`. The backend seeds on startup when the database file is missing.
- `main.py` has every route. `models.py` has the Pydantic shapes. The dashboard's `dashboard/src/api.ts` mirrors those shapes by hand, so change both together.
- Every operation needs an `operation_id`, a one-line docstring and no optional inputs. `test_operations_follow_the_conventions` in `backend/tests/test_records.py` enforces this.

### The claim's journey

- `start_claim` moves a claim from `waiting` to `in_progress`.
- `decide_claim` moves it to `decided`. An approval over `payout_approval_limit` (from `data/company.json`) goes to `awaiting_sign_off` instead. A decline or a referral must have a payout of 0.
- `pay_claim` is separate and takes the amount. It must match the approved payout, and over the limit it gets a 403 until there's a sign-off.
- `sign_off_claim` records the handler and pays the payout itself.
- Errors are 404 for an unknown id, 409 for the wrong status, 403 for a payment that needs sign-off, and 422 for bad input.

### Agent (`agent/`)

- The agent is LangChain's `create_agent` on OpenAI: `ChatOpenAI` with `gpt-6-luna` at low reasoning effort. `MODEL_NAME` overrides the model and then leaves the reasoning effort unset.
  - The student moved from OpenRouter to OpenAI, and `docs/TECH_STACK.md` reflects that.
- `BACKEND_URL` is hard-coded to `http://localhost:8000`.
- `run(claim_id, thread_id)` works one claim:
  1. Fetches its system prompt from `GET /api/instructions`, whose source is `backend/instructions.md`. Edit that file to change how the agent decides.
  2. Builds the agent before `start_claim`, so a missing key leaves the claim waiting.
  3. Streams with `stream_mode="updates"` and posts every message, tool call and tool result to the backend as a step. `CALL_TITLES` and `RESULT_TITLES` turn them into plain-language titles.
- A tool returns the backend's refusal to the model as text starting "The backend refused: ". It doesn't raise, so the model can read the refusal and recover.

### Dashboard (`dashboard/src/`)

- `App.tsx` does hash routing (`#/`, `#/claims/<id>`, `#/instructions`), with no router package.
- `useApi(path, refreshMs)` fetches a path and polls it. The pages poll every 2 seconds to show the agent working live. A `null` path waits.
- The brand's colors are tokens in `styles.css`, with dark mode under `prefers-color-scheme`.

### Tests

- **pytest:** fixtures in each `tests/conftest.py` point `UNDERCOVER_DB` at a temp file and seed it.
- **Agent tests:** they patch `agent.main.backend` to return `TestClient(app)` and drive `run()` with `StubModel`, a `GenericFakeChatModel` whose `bind_tools` returns itself. Tests never call a real model.
- **vitest:** `stubApi` in `testing.ts` stubs `fetch` with replies keyed by `"METHOD /path"`. A reply can be a function, and throwing from it simulates the backend being down.
- **Playwright:** `playwright.config.ts` starts its own backend on port 8001, with a freshly seeded `e2e/undercover-e2e.db`, and its own Vite on port 5174, pointed at it by `BACKEND_PORT`. That way e2e never changes the dev queue. Tests in one run share that database, so each test that changes data uses its own claim.

## Lint rules that catch new code

- ESLint runs `strictTypeChecked` and `sonarjs`:
  - component props must be `Readonly<...>`
  - optional chaining on a value that can't be null is an error
  - React 19.3's types deprecate `FormEvent`, so use `SubmitEvent`
- Ruff's line limit is 88.
- `sqlite3.Row` iterates over its values, not its keys, so use `dict(row)`.
