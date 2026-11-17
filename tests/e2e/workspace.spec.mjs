import { test, expect } from "@playwright/test";

test("renders the demo workspace without console or page errors", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.locator("#root")).toContainText("InfiniteX");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Demo workspace")).toBeVisible();
  await expect(page.getByText("LOCAL DEMO")).toBeVisible();
  await expect(page.getByText("No connected data source").first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("navigates across all six workspace sections", async ({ page }) => {
  await page.goto("/");
  const sections = [
    ["AI Agents", "Registered agent examples"],
    ["Pipelines", "Pipeline examples"],
    ["Sample Logs", "Example log entries"],
    ["Security", "Security verification"],
    ["Settings", "Workspace settings"],
    ["Overview", "Demo workspace"],
  ];

  for (const [navigation, heading] of sections) {
    await page.getByRole("button", { name: navigation }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(page.getByRole("button", { name: navigation })).toHaveAttribute("aria-current", "page");
  }
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

test("mobile navigation uses a fixed bottom bar with accessible touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const sidebar = page.locator(".sidebar");
  await expect(sidebar).toHaveCSS("position", "fixed");
  await expect(sidebar).toHaveCSS("bottom", "0px");

  const targets = await page.locator(".nav-item").evaluateAll((items) =>
    items.map((item) => Math.round(item.getBoundingClientRect().height)),
  );
  expect(targets).toHaveLength(6);
  expect(targets.every((height) => height >= 44)).toBe(true);

  await page.getByRole("button", { name: "Security" }).click();
  await expect(page.getByRole("heading", { name: "Security verification" })).toBeVisible();
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

test("theme preference survives a page reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
});

test("responsive layout has no horizontal document overflow at common viewport widths", async ({ page }) => {
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(
      dimensions.document,
      "Unexpected horizontal overflow at viewport width " + width + "px",
    ).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test("reduced-motion preference is respected by the application stylesheet", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const transitionDuration = await page.locator(".nav-item").first().evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  expect(transitionDuration.split(",").every((duration) => {
    const seconds = duration.trim().endsWith("ms")
      ? Number.parseFloat(duration) / 1000
      : Number.parseFloat(duration);
    return seconds <= 0.001;
  })).toBe(true);
});
