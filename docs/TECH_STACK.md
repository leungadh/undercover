# Tech stack

- `backend/`: FastAPI and SQLite. Every API operation has an `operation_id`, a one-line docstring and no optional inputs. Paying a claim is a separate operation that takes the amount.
- `agent/`: LangChain's `create_agent` on OpenAI, with one entry point that takes a claim id and a thread id. It reaches claims and its instructions only through the backend's API. It uses `gpt-6-luna` with low reasoning effort by default, or the OpenAI model in the environment variable `MODEL_NAME` if set, such as `gpt-5-mini`.
- `dashboard/`: React, Vite and TypeScript.
- `e2e/`: Playwright tests.
- `data/`: the business data the backend starts from. The agent never sees `data/evals/`, which holds the answer key.

Python 3.12 with uv, all in the root `pyproject.toml`. Node 26. The OpenAI key is `OPENAI_API_KEY` in `.env`.
