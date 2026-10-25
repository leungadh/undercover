import { vi } from "vitest";
import type {
  Claim,
  ClaimSummary,
  Customer,
  Handler,
  Policy,
  Step,
} from "./api";

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

export function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    claim_id: "CLM-1001",
    policy_id: "POL-2001",
    customer_id: "CUS-3001",
    claim_type: "trip_delay",
    submitted_on: "2026-06-24",
    incident_date: "2026-06-18",
    incident_location: "Rome, Italy",
    summary: "Flight home canceled",
    story: "My flight home from Rome was canceled.",
    items: [
      { description: "Airport hotel", category: "accommodation", amount: 245 },
      { description: "Dinner and breakfast", category: "meals", amount: 175 },
    ],
    amount_claimed: 420,
    documents: [
      {
        name: "Cancellation notice",
        type: "carrier_report",
        content: "Flight MA 611 was canceled.",
      },
    ],
    status: "waiting",
    decision: null,
    payout: null,
    reason: null,
    policy_section: null,
    decided_at: null,
    signed_off_by: null,
    signed_off_at: null,
    paid_amount: null,
    paid_at: null,
    ...overrides,
  };
}

export function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    policy_id: "POL-2001",
    customer_id: "CUS-3001",
    plan: "premium",
    add_ons: ["electronics_plus"],
    purchased_on: "2026-04-22",
    sold_through: "Meridian Air checkout",
    trip: {
      destination: "Rome, Italy",
      departs_on: "2026-06-10",
      returns_on: "2026-06-18",
      trip_cost: 3100,
    },
    travelers: ["Maya Patel"],
    status: "active",
    plan_details: {
      plan: "premium",
      name: "UnderCover Premium",
      trip_cancellation_max: 5000,
      trip_delay_waiting_hours: 6,
      trip_delay_max: 800,
      baggage_delay_waiting_hours: 12,
      baggage_delay_max: 300,
      baggage_max: 1500,
      per_item_limit: 300,
      passport_max: 250,
      emergency_medical_max: 100000,
      deductible: 50,
    },
    ...overrides,
  };
}

export function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    customer_id: "CUS-3001",
    name: "Maya Patel",
    email: "maya.patel@example.com",
    phone: "+1 201 555 0143",
    date_of_birth: "1988-03-14",
    address: {
      street: "48 Wayne Street",
      city: "Jersey City",
      state: "NJ",
      zip: "07302",
    },
    customer_since: "2023-04-11",
    previous_claims: [
      {
        claim_id: "CLM-0412",
        filed_on: "2024-08-19",
        incident_date: "2024-08-09",
        claim_type: "baggage_delay",
        summary: "Checked bag arrived 30 hours late",
        outcome: "approved",
        amount_paid: 140,
      },
    ],
    ...overrides,
  };
}

export const HANDLERS: Handler[] = [
  {
    handler_id: "HND-01",
    name: "Dana Whitfield",
    role: "Senior Claims Handler",
    email: "dana.whitfield@undercover.example",
    can_approve_over_limit: true,
  },
];

export function step(overrides: Partial<Step> = {}): Step {
  return {
    step_id: 1,
    kind: "tool_call",
    title: "Read claim CLM-1001",
    detail: '{"claim_id": "CLM-1001"}',
    created_at: "2026-10-25T14:00:00+00:00",
    ...overrides,
  };
}
