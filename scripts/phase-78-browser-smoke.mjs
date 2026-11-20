import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.INFINITEX_BASE_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto(baseURL, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, "built app should return HTTP 200");
  await assert.doesNotReject(() => page.getByRole("heading", { name: "Session could not be verified" }).waitFor());

  assert.equal(await page.getByRole("button", { name: "Retry session check" }).count(), 1);
  assert.equal(await page.locator(".app-shell").count(), 0, "protected workspace must remain hidden without valid auth configuration");
  assert.equal(await page.getByRole("alert").count(), 1, "fail-closed auth state should be announced accessibly");

  const mobileLayout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(mobileLayout.content <= mobileLayout.viewport + 1, `mobile viewport overflows horizontally: ${JSON.stringify(mobileLayout)}`);

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopLayout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(desktopLayout.content <= desktopLayout.viewport + 1, `desktop viewport overflows horizontally: ${JSON.stringify(desktopLayout)}`);

  assert.deepEqual(pageErrors, [], "browser runtime should not emit uncaught page errors");

  await page.getByRole("button", { name: "Retry session check" }).click();
  await page.getByRole("heading", { name: "Session could not be verified" }).waitFor();
  assert.equal(await page.locator(".app-shell").count(), 0, "retry must not bypass authentication");

  console.log("PASS: HTTP response, fail-closed auth UI, accessible alert, retry, mobile/desktop overflow, and browser runtime error checks");
} finally {
  await browser.close();
}
