import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.INFINITEX_AUTH_BASE_URL ?? "http://127.0.0.1:4174";
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const pageErrors = [];
  const authCalls = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("https://example.supabase.co/auth/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    authCalls.push({ method: request.method(), path: url.pathname, grant: url.searchParams.get("grant_type") });
    const corsHeaders = {
      "access-control-allow-origin": "http://127.0.0.1:4174",
      "access-control-allow-headers": "apikey, authorization, content-type, x-client-info",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (url.pathname.endsWith("/token") && url.searchParams.get("grant_type") === "password") {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({ code: "invalid_credentials", message: "Invalid login credentials" }),
      });
      return;
    }

    if (url.pathname.endsWith("/recover")) {
      await route.fulfill({ status: 200, contentType: "application/json", headers: corsHeaders, body: "{}" });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", headers: corsHeaders, body: JSON.stringify({ message: "Unmocked auth endpoint" }) });
  });

  const response = await page.goto(baseURL, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();

  const submit = page.getByRole("button", { name: "Sign in securely" });
  await submit.click();
  await page.getByRole("alert").getByText("Enter a valid email address.").waitFor();
  assert.equal(authCalls.length, 0, "invalid client input must not call the auth endpoint");

  await page.getByLabel("Email address").fill("not-an-email");
  await page.getByLabel("Password").fill("incorrect-password");
  await submit.click();
  await page.getByRole("alert").getByText("Enter a valid email address.").waitFor();
  assert.equal(authCalls.length, 0, "malformed email must be rejected before network access");

  await page.getByLabel("Email address").fill("synthetic@example.test");
  await page.getByRole("button", { name: "Show password" }).click();
  assert.equal(await page.getByLabel("Password").getAttribute("type"), "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  assert.equal(await page.getByLabel("Password").getAttribute("type"), "password");

  await submit.click();
  await page.getByRole("alert").getByText("Email or password is incorrect. Check your details and try again.").waitFor();
  assert.equal(authCalls.filter(call => call.grant === "password").length, 1, "valid-form sign-in should reach the mocked auth boundary");

  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Password").fill("synthetic-password-1");
  await page.getByLabel("Confirm password").fill("synthetic-password-2");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("alert").getByText("Your passwords do not match.").waitFor();
  assert.equal(authCalls.filter(call => call.path.endsWith("/signup")).length, 0, "mismatched passwords must not reach auth");

  await page.getByRole("tab", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByRole("heading", { name: "Reset your password." }).waitFor();
  await page.getByLabel("Email address").fill("synthetic@example.test");
  await page.getByRole("button", { name: "Send recovery link" }).click();
  await page.getByRole("status").getByText("If an account exists for that email, a password reset link will be sent.").waitFor();
  assert.equal(authCalls.filter(call => call.path.endsWith("/recover")).length, 1);

  assert.deepEqual(pageErrors, [], "auth UI must not emit uncaught browser errors");
  console.log("PASS: anonymous auth UI, input validation, password visibility, sanitized sign-in error, sign-up confirmation, password recovery, and browser runtime");
  await context.close();
} finally {
  await browser.close();
}
