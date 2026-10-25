import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InstructionsPage } from "./InstructionsPage";
import { stubApi } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows the agent's instructions, read only", async () => {
  stubApi({ "GET /api/instructions": { content: "# The UnderCover Agent" } });
  const { container } = render(<InstructionsPage />);
  expect(await screen.findByText("# The UnderCover Agent")).toBeDefined();
  expect(container.querySelector("textarea, input, button")).toBeNull();
});

it("says when it can't reach the backend", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<InstructionsPage />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Can't reach the backend",
  );
});
