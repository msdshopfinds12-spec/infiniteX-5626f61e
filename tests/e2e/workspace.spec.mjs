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
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller) ||
    Boolean(navigator.serviceWorker?.getRegistration("/")));
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller));
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});
