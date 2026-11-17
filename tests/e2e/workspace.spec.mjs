import { test, expect } from "@playwright/test";

test("renders the demo workspace without console or page errors", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Demo workspace")).toBeVisible();
  await expect(page.getByText("No connected data source").first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("navigates between workspace sections", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "AI Agents" }).click();
  await expect(page.getByRole("heading", { name: "AI Agents" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registered agent examples" })).toBeVisible();

  await page.getByRole("button", { name: "Pipelines" }).click();
  await expect(page.getByRole("heading", { name: "Pipelines" })).toBeVisible();
  await expect(page.getByText("auth-service")).toBeVisible();
});

test("search filters sample agents and reports empty results", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Search sample agents" });
  await search.fill("Sentinel");
  await expect(page.getByRole("heading", { name: "AI Agents" })).toBeVisible();
  await expect(page.getByText("Sentinel")).toBeVisible();
  await expect(page.getByText("Atlas")).toHaveCount(0);

  await search.fill("no-such-agent");
  await expect(page.getByRole("status").filter({ hasText: "No sample agents match" })).toBeVisible();
});

test("theme toggle changes the document theme and accessible label", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Switch to light mode" });
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
});

test("preview actions explain that no job is executed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Preview action" }).click();
  await expect(page.getByRole("status")).toContainText("No job was started");
});

test("mobile viewport keeps the document within the viewport width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.getByRole("button", { name: "AI Agents" })).toBeVisible();
});

test("keyboard users can skip navigation and operate the workspace", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const agentsButton = page.getByRole("button", { name: "AI Agents" });
  await agentsButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "AI Agents" })).toBeVisible();
});

test("search input is rendered as text and cannot inject markup", async ({ page }) => {
  await page.goto("/");
  const payload = '<img src=x onerror=alert(1)> Sentinel';
  const search = page.getByRole("searchbox", { name: "Search sample agents" });
  await search.fill(payload);

  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("No sample agents match");
});
