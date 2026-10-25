import { vi } from "vitest";
import type { ClaimSummary } from "./api";

type Reply = (init?: RequestInit) => unknown;

/** Stub fetch with replies keyed by "METHOD /path"; a function reply is called. */
export function stubApi(routes: Record<string, unknown>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = input instanceof Request ? input.url : input.toString();
    const route = routes[`${init?.method ?? "GET"} ${path}`];
    if (route === undefined)
      return Promise.resolve(
        Response.json({ detail: `No route for ${path}` }, { status: 404 }),
      );
    const body = typeof route === "function" ? (route as Reply)(init) : route;
    return Promise.resolve(
      body instanceof Response ? body : Response.json(body),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function summary(overrides: Partial<ClaimSummary> = {}): ClaimSummary {
  return {
    claim_id: "CLM-1001",
    customer_name: "Maya Patel",
    claim_type: "trip_delay",
    summary: "Flight home canceled",
    amount_claimed: 420,
    submitted_on: "2026-06-24",
    status: "waiting",
    decision: null,
    payout: null,
    ...overrides,
  };
}
