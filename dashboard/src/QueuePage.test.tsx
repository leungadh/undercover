import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QueuePage } from "./QueuePage";
import { stubApi, summary } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const QUEUE = [
  summary(),
  summary({
    claim_id: "CLM-1002",
    customer_name: "Sam Ortiz",
    claim_type: "baggage",
    amount_claimed: 1150,
    status: "in_progress",
  }),
  summary({
    claim_id: "CLM-1003",
    status: "awaiting_sign_off",
    decision: "approve",
    payout: 1250,
  }),
  summary({
    claim_id: "CLM-1004",
    status: "decided",
    decision: "decline",
    payout: 0,
  }),
];

it("lists every claim with where it stands", async () => {
  stubApi({ "GET /api/claims": QUEUE });
  render(<QueuePage />);
  const link = await screen.findByRole("link", { name: "CLM-1001" });
  expect(link.getAttribute("href")).toBe("#/claims/CLM-1001");
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(5);
  const second = within(table).getAllByRole("row")[2];
  expect(second.textContent).toContain("Sam Ortiz");
  expect(second.textContent).toContain("Baggage");
  expect(second.textContent).toContain("$1,150.00");
  expect(second.textContent).toContain("Jun 24, 2026");
  expect(second.textContent).toContain("In progress");
  expect(within(table).getByText("Approved")).toBeDefined();
  expect(within(table).getByText("$1,250.00")).toBeDefined();
  expect(within(table).getByText("Declined")).toBeDefined();
  expect(within(table).getAllByText("None yet")).toHaveLength(2);
});

it("counts the claims by status", async () => {
  stubApi({ "GET /api/claims": [...QUEUE, summary({ claim_id: "CLM-1005" })] });
  render(<QueuePage />);
  expect((await screen.findByLabelText("Waiting")).textContent).toBe("2");
  expect(screen.getByLabelText("In progress").textContent).toBe("1");
  expect(screen.getByLabelText("Waiting for sign-off").textContent).toBe("1");
  expect(screen.getByLabelText("Decided").textContent).toBe("1");
});

it("says when it can't reach the backend", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<QueuePage />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Can't reach the backend",
  );
});
