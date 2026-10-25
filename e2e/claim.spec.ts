import { expect, test } from "@playwright/test";

test("a claim's page shows the claim, the policy and the history", async ({
  page,
}) => {
  await page.goto("/#/claims/CLM-1001");
  const details = page.getByRole("region", { name: "The claim" });
  await expect(details).toContainText("My flight home from Rome");
  await expect(details.locator("tbody tr")).toHaveCount(3);
  await expect(details.locator("tfoot")).toContainText("$420.00");
  await expect(details.locator(".cards li")).toHaveCount(4);
  await expect(page.getByRole("region", { name: "Policy" })).toContainText(
    "UnderCover Premium",
  );
  await expect(page.getByRole("region", { name: "Customer" })).toContainText(
    "CLM-0412",
  );
});

test("a held approval shows the agent's steps and is paid on sign-off", async ({
  page,
  request,
}) => {
  const claim = "/api/claims/CLM-1003";
  await request.post(`${claim}/start`);
  for (const [kind, title] of [
    ["tool_call", "Read claim CLM-1003"],
    ["tool_result", "Got the claim"],
  ]) {
    await request.post(`${claim}/steps`, {
      data: { kind, title, detail: "{}" },
    });
  }
  await request.post(`${claim}/decision`, {
    data: {
      decision: "approve",
      payout: 1250,
      reason: "The treatment is covered.",
      policy_section: "Section 7, Emergency Medical",
    },
  });
  const refused = await request.post(`${claim}/payment`, {
    data: { amount: 1250 },
  });
  expect(refused.status()).toBe(403);

  await page.goto("/#/claims/CLM-1003");
  const steps = page.getByRole("region", { name: "The agent's steps" });
  await expect(steps.getByText("Read claim CLM-1003")).toBeVisible();
  await expect(steps.getByText("Got the claim")).toBeVisible();
  const decision = page.getByRole("region", { name: "Decision" });
  await expect(decision).toContainText("Approved $1,250.00");
  await expect(decision).toContainText("waits for a handler's sign-off");

  const form = page.getByRole("form", { name: "Sign-off" });
  await form.getByRole("combobox").selectOption({ label: "Dana Whitfield" });
  await form.getByRole("button", { name: "Sign off and pay" }).click();
  await expect(decision).toContainText("Signed off by Dana Whitfield");
  await expect(decision).toContainText("Paid $1,250.00");

  await page.goto("/");
  await expect(page.getByRole("row", { name: /CLM-1003/ })).toContainText(
    "Decided",
  );
});

test("an unknown claim says it wasn't found", async ({ page }) => {
  await page.goto("/#/claims/CLM-9999");
  await expect(
    page.getByText("We couldn't find claim CLM-9999."),
  ).toBeVisible();
});

test("the instructions page shows the agent's instructions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Agent instructions" }).click();
  const instructions = page.getByRole("region", { name: "Instructions" });
  await expect(instructions).toContainText("# The UnderCover Agent");
  await expect(page.locator("textarea, input")).toHaveCount(0);
});
