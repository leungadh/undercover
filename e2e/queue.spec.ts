import { expect, test } from "@playwright/test";

test("the queue shows every claim", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Claims queue" }),
  ).toBeVisible();
  const claims = page.getByRole("region", { name: "Claims", exact: true });
  await expect(claims.getByRole("row")).toHaveCount(26);
  await expect(claims.getByRole("row").nth(1)).toContainText("Maya Patel");
  await expect(claims.getByRole("row").nth(1)).toContainText("$420.00");
});

test("a claim the agent starts shows as in progress", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const row = page.getByRole("row", { name: /CLM-1002/ });
  await expect(row).toContainText("Waiting");
  await request.post("/api/claims/CLM-1002/start");
  await expect(row).toContainText("In progress", { timeout: 3000 });
});

test("a claim's id opens its page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "CLM-1001" }).click();
  await expect(page).toHaveURL(/#\/claims\/CLM-1001$/);
  await expect(page.getByRole("heading", { name: "CLM-1001" })).toBeVisible();
});
