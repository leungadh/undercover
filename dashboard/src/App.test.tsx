import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { stubApi, summary } from "./testing";

beforeEach(() => {
  stubApi({
    "GET /api/claims": [summary()],
    "GET /api/instructions": { content: "# The UnderCover Agent" },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

function go(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

it("opens on the queue", async () => {
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Claims queue" }),
  ).toBeDefined();
  const queue = screen.getByRole("link", { name: "Queue" });
  expect(queue.getAttribute("aria-current")).toBe("page");
});

it("goes to a claim's page", async () => {
  render(<App />);
  go("#/claims/CLM-1001");
  expect(
    await screen.findByRole("heading", { name: "CLM-1001" }),
  ).toBeDefined();
});

it("goes to the agent's instructions", async () => {
  render(<App />);
  go("#/instructions");
  expect(
    await screen.findByRole("heading", { name: "Agent instructions" }),
  ).toBeDefined();
  const link = screen.getByRole("link", { name: "Agent instructions" });
  expect(link.getAttribute("aria-current")).toBe("page");
});
