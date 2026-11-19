import { test, expect } from "@playwright/test";

test("renders honest local demo state without runtime errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Demo workspace")).toBeVisible();
  await expect(page.getByText("LOCAL DEMO", { exact: true })).toBeVisible();
  await expect(page.getByText("No connected data source").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("navigates across all six workspace sections", async ({ page }) => {
  await page.goto("/");
  for (const [label, heading] of [
    ["AI Agents", "Registered agent examples"],
    ["Pipelines", "Pipeline examples"],
    ["Sample Logs", "Example log entries"],
    ["Security", "Security verification"],
    ["Settings", "Workspace settings"],
    ["Overview", "Overview"],
  ]) {
    await page.getByRole("button", { name: label }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("search filters sample records and renders untrusted text safely", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search sample agents" });
  await search.fill("Sentinel");
  await expect(page.getByText("Sentinel")).toBeVisible();
  await expect(page.getByText("Atlas")).toHaveCount(0);
  await search.fill('<img src=x onerror=alert(1)>');
  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("No sample agents match");
});

test("mobile layout has no horizontal overflow and touch-sized navigation", async ({ page }) => {
  for (const width of [320, 360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    const heights = await page.locator(".nav-item").evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().height));
    expect(heights.every((height) => height >= 44)).toBe(true);
  }
});

test("theme preference is accessible and persists after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("production service worker registers and app shell remains available offline", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker?.getRegistration("/")));
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("task center requires explicit approval before showing simulated execution state", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Task Center" }).click();
  await expect(page.getByRole("heading", { name: "Task Center" })).toBeVisible();
  await expect(page.getByText("NO EXECUTION")).toBeVisible();

  const card = page.locator(".task-card").filter({ hasText: "Review application architecture" });
  await card.getByRole("button", { name: "Start planning" }).click();
  await card.getByRole("button", { name: "Request approval" }).click();
  await expect(card.getByText("awaiting approval")).toBeVisible();
  await expect(card.getByRole("button", { name: "Approve simulation" })).toBeVisible();
  await card.getByRole("button", { name: "Approve simulation" }).click();
  await expect(card.getByText("approved", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Preview execution state" }).click();
  await expect(card.getByText("running", { exact: true })).toBeVisible();
  await expect(page.getByText(/No external action was performed/)).toBeVisible();
});

test("task center rejects a task through the human review control", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Task Center" }).click();
  const card = page.locator(".task-card").filter({ hasText: "Prepare quality assurance checklist" });
  await card.getByRole("button", { name: "Start planning" }).click();
  await card.getByRole("button", { name: "Request approval" }).click();
  await card.getByRole("button", { name: "Reject" }).click();
  await expect(card.getByText("cancelled", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Approve simulation" })).toHaveCount(0);
});

test("task history disclosure is scoped to the selected task", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Task Center" }).click();
  const cards = page.locator(".task-card");
  await cards.nth(0).getByRole("button", { name: "View history" }).click();
  await expect(cards.nth(0).getByRole("list", { name: /State history/ })).toBeVisible();
  await expect(cards.nth(1).getByRole("list", { name: /State history/ })).toHaveCount(0);
});
