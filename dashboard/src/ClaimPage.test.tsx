import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Claim } from "./api";
import { ClaimPage } from "./ClaimPage";
import { HANDLERS, claim, customer, policy, step, stubApi } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubClaim(current: Claim, extra: Record<string, unknown> = {}) {
  return stubApi({
    "GET /api/claims/CLM-1001": current,
    "GET /api/claims/CLM-1001/steps": [],
    "GET /api/policies/POL-2001": policy(),
    "GET /api/customers/CUS-3001": customer(),
    "GET /api/handlers": HANDLERS,
    ...extra,
  });
}

const HELD = claim({
  status: "awaiting_sign_off",
  decision: "approve",
  payout: 1250,
  reason: "The delay is covered.",
  policy_section: "Section 3, Trip Delay",
  decided_at: "2026-10-25T14:00:00+00:00",
});

it("shows the claim in full", async () => {
  stubClaim(claim());
  render(<ClaimPage claimId="CLM-1001" />);
  const details = await screen.findByRole("region", { name: "The claim" });
  expect(details.textContent).toContain("Jun 18, 2026, Rome, Italy");
  expect(details.textContent).toContain("My flight home from Rome");
  expect(details.textContent).toContain("Airport hotel");
  expect(within(details).getByText("Total claimed")).toBeDefined();
  expect(within(details).getByText("$420.00")).toBeDefined();
  expect(details.textContent).toContain("Cancellation notice");
  expect(screen.getByText("Waiting")).toBeDefined();
  expect(screen.getByText("No decision yet.")).toBeDefined();
  expect(
    screen.getByText("The agent hasn't started on this claim yet."),
  ).toBeDefined();
});

it("shows the policy and the customer's history", async () => {
  stubClaim(claim());
  render(<ClaimPage claimId="CLM-1001" />);
  const policyPanel = await screen.findByRole("region", { name: "Policy" });
  expect(policyPanel.textContent).toContain("UnderCover Premium");
  expect(policyPanel.textContent).toContain("Electronics plus");
  expect(policyPanel.textContent).toContain("Jun 10, 2026 to Jun 18, 2026");
  expect(policyPanel.textContent).toContain("$3,100.00");
  const customerPanel = await screen.findByRole("region", {
    name: "Customer",
  });
  expect(customerPanel.textContent).toContain("Maya Patel");
  expect(customerPanel.textContent).toContain("CLM-0412");
  expect(customerPanel.textContent).toContain("$140.00");
});

it("says when a policy has no add-ons and a customer no history", async () => {
  stubClaim(claim(), {
    "GET /api/policies/POL-2001": policy({ add_ons: [] }),
    "GET /api/customers/CUS-3001": customer({ previous_claims: [] }),
  });
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("None")).toBeDefined();
  expect(await screen.findByText("No earlier claims.")).toBeDefined();
});

it("shows the agent's steps", async () => {
  stubClaim(claim({ status: "in_progress" }), {
    "GET /api/claims/CLM-1001/steps": [
      step(),
      step({ step_id: 2, kind: "message", title: "Approved.", detail: "" }),
    ],
  });
  render(<ClaimPage claimId="CLM-1001" />);
  const steps = await screen.findByRole("region", {
    name: "The agent's steps",
  });
  expect(await within(steps).findByText("Read claim CLM-1001")).toBeDefined();
  expect(within(steps).getByText("Approved.")).toBeDefined();
  expect(within(steps).getAllByText("Show details")).toHaveLength(1);
  expect(screen.getByText("The agent is working on this claim.")).toBeDefined();
});

it("says when a claim in progress has no steps yet", async () => {
  stubClaim(claim({ status: "in_progress" }));
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("No steps recorded yet.")).toBeDefined();
});

it("shows a paid decision", async () => {
  stubClaim(
    claim({
      status: "decided",
      decision: "approve",
      payout: 420,
      reason: "The delay is covered.",
      policy_section: "Section 3, Trip Delay",
      decided_at: "2026-10-25T14:00:00+00:00",
      paid_amount: 420,
      paid_at: "2026-10-25T14:01:00+00:00",
    }),
  );
  render(<ClaimPage claimId="CLM-1001" />);
  const decision = await screen.findByRole("region", { name: "Decision" });
  expect(decision.textContent).toContain("Approved $420.00");
  expect(decision.textContent).toContain("The delay is covered.");
  expect(decision.textContent).toContain(
    "Policy wording: Section 3, Trip Delay",
  );
  expect(decision.textContent).toContain("Paid $420.00 on");
  expect(within(decision).queryByRole("form")).toBeNull();
});

it("shows an approval that wasn't paid", async () => {
  stubClaim(claim({ status: "decided", decision: "approve", payout: 420 }));
  render(<ClaimPage claimId="CLM-1001" />);
  expect(await screen.findByText("Not paid")).toBeDefined();
});

it("shows a decline without a payment", async () => {
  stubClaim(
    claim({ status: "decided", decision: "decline", payout: 0, reason: "No." }),
  );
  render(<ClaimPage claimId="CLM-1001" />);
  const decision = await screen.findByRole("region", { name: "Decision" });
  expect(await within(decision).findByText("Declined")).toBeDefined();
  expect(decision.textContent).not.toContain("Paid");
});

it("signs off a held approval, which pays it", async () => {
  let current = HELD;
  const fetchMock = stubClaim(HELD, {
    "GET /api/claims/CLM-1001": () => current,
    "POST /api/claims/CLM-1001/sign-off": () => {
      current = {
        ...HELD,
        status: "decided",
        signed_off_by: "HND-01",
        signed_off_at: "2026-10-25T15:00:00+00:00",
        paid_amount: 1250,
        paid_at: "2026-10-25T15:00:00+00:00",
      };
      return current;
    },
  });
  render(<ClaimPage claimId="CLM-1001" />);
  const form = await screen.findByRole("form", { name: "Sign-off" });
  expect(form.textContent).toContain("Signing off pays $1,250.00");
  expect(
    screen.getByText("Not paid. The payment waits for a handler's sign-off."),
  ).toBeDefined();
  const button = within(form).getByRole("button", { name: "Sign off and pay" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(within(form).getByRole("combobox"), {
    target: { value: "HND-01" },
  });
  fireEvent.click(button);
  expect(
    await screen.findByText(/^Signed off by Dana Whitfield on/),
  ).toBeDefined();
  expect(await screen.findByText(/^Paid \$1,250.00 on/)).toBeDefined();
  expect(screen.queryByRole("form", { name: "Sign-off" })).toBeNull();
  const signOff = fetchMock.mock.calls.find(
    ([path]) => path === "/api/claims/CLM-1001/sign-off",
  );
  expect(signOff?.[1]?.body).toBe('{"handler_id":"HND-01"}');
});

it("shows why a sign-off failed", async () => {
  stubClaim(HELD, {
    "POST /api/claims/CLM-1001/sign-off": () =>
      Response.json({ detail: "Handler HND-01 not found" }, { status: 404 }),
  });
  render(<ClaimPage claimId="CLM-1001" />);
  const form = await screen.findByRole("form", { name: "Sign-off" });
  fireEvent.change(within(form).getByRole("combobox"), {
    target: { value: "HND-01" },
  });
  fireEvent.click(within(form).getByRole("button"));
  expect((await within(form).findByRole("alert")).textContent).toBe(
    "Handler HND-01 not found",
  );
});

it("gives a plain reason when a sign-off fails without one", async () => {
  stubClaim(HELD, {
    "POST /api/claims/CLM-1001/sign-off": () =>
      Response.json({ detail: [] }, { status: 422 }),
  });
  render(<ClaimPage claimId="CLM-1001" />);
  const form = await screen.findByRole("form", { name: "Sign-off" });
  fireEvent.change(within(form).getByRole("combobox"), {
    target: { value: "HND-01" },
  });
  fireEvent.click(within(form).getByRole("button"));
  expect((await within(form).findByRole("alert")).textContent).toBe(
    "The sign-off didn't go through.",
  );
});

it("says when a claim doesn't exist", async () => {
  stubApi({});
  render(<ClaimPage claimId="CLM-9999" />);
  expect(
    await screen.findByText("We couldn't find claim CLM-9999."),
  ).toBeDefined();
});

it("says when it can't reach the backend", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<ClaimPage claimId="CLM-1001" />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Can't reach the backend",
  );
});

it("keeps the last update when the backend goes away", async () => {
  let up = true;
  stubClaim(claim(), {
    "GET /api/claims/CLM-1001": () => {
      if (!up) throw new Error("offline");
      return claim();
    },
  });
  render(<ClaimPage claimId="CLM-1001" />);
  await screen.findByRole("region", { name: "The claim" });
  up = false;
  expect(
    await screen.findByText(
      "Can't reach the backend. Showing the last update.",
      {},
      { timeout: 3000 },
    ),
  ).toBeDefined();
});
