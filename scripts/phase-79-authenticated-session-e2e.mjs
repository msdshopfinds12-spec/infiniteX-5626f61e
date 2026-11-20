import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.INFINITEX_AUTH_BASE_URL ?? "http://127.0.0.1:4175";
const browser = await chromium.launch({ headless: true });
const identities = new Map([
  ["alpha@example.test", { id: "synthetic-user-alpha", token: "synthetic-access-alpha" }],
  ["beta@example.test", { id: "synthetic-user-beta", token: "synthetic-access-beta" }],
]);
const authRequests = [];
const pageErrors = [];

function userFor(identity, email) {
  return {
    id: identity.id,
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("https://example.supabase.co/auth/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = request.headers().authorization ?? "";
    authRequests.push({ method: request.method(), path: url.pathname, grant: url.searchParams.get("grant_type"), authorization });

    const corsHeaders = {
      "access-control-allow-origin": "http://127.0.0.1:4175",
      "access-control-allow-headers": "apikey, authorization, content-type, x-client-info",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (url.pathname.endsWith("/token") && url.searchParams.get("grant_type") === "password") {
      const body = request.postDataJSON();
      const identity = identities.get(body.email);
      if (!identity || body.password !== "synthetic-password-123") {
        await route.fulfill({
          status: 400, contentType: "application/json", headers: corsHeaders,
          body: JSON.stringify({ code: "invalid_credentials", message: "Invalid login credentials" }),
        });
        return;
      }
      await route.fulfill({
        status: 200, contentType: "application/json", headers: corsHeaders,
        body: JSON.stringify({
          access_token: identity.token,
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: `synthetic-refresh-${identity.id}`,
          user: userFor(identity, body.email),
        }),
      });
      return;
    }

    if (url.pathname.endsWith("/user") && request.method() === "GET") {
      const identity = [...identities.entries()].find(([, value]) => authorization === `Bearer ${value.token}`);
      if (!identity) {
        await route.fulfill({ status: 401, contentType: "application/json", headers: corsHeaders, body: JSON.stringify({ message: "Invalid token" }) });
        return;
      }
      await route.fulfill({
        status: 200, contentType: "application/json", headers: corsHeaders,
        body: JSON.stringify(userFor(identity[1], identity[0])),
      });
      return;
    }

    if (url.pathname.endsWith("/logout")) {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
      return;
    }

    await route.fulfill({
      status: 404, contentType: "application/json", headers: corsHeaders,
      body: JSON.stringify({ message: "Unmocked auth endpoint" }),
    });
  });

  const response = await page.goto(baseURL, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();

  async function signIn(email) {
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("synthetic-password-123");
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await page.getByText("Authenticated session").waitFor();
    await page.getByText("READ-ONLY INTEGRATION").waitFor();
  }

  await signIn("alpha@example.test");
  assert.equal(authRequests.filter((item) => item.path.endsWith("/token") && item.grant === "password").length, 1);
  assert.ok(authRequests.some((item) => item.path.endsWith("/user") && item.authorization === "Bearer synthetic-access-alpha"));

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();
  await page.getByLabel("Password", { exact: true }).waitFor();

  await signIn("beta@example.test");
  assert.equal(authRequests.filter((item) => item.path.endsWith("/token") && item.grant === "password").length, 2);
  assert.ok(authRequests.some((item) => item.path.endsWith("/user") && item.authorization === "Bearer synthetic-access-beta"));
  assert.ok(!authRequests.some((item) => item.path.endsWith("/user") && item.authorization === "Bearer synthetic-access-alpha" && item.method === "POST"), "identity lookup must not mutate the prior account");

  assert.deepEqual(pageErrors, [], "account switching must not emit uncaught browser errors");
  console.log("PASS: synthetic account A sign-in, sign-out, account B sign-in, authenticated workspace gating, and browser runtime");
  await context.close();
} finally {
  await browser.close();
}
