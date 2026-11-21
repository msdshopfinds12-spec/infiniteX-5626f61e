import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.INFINITEX_WORKFLOW_E2E_BASE_URL ?? "http://127.0.0.1:4176";
const browser = await chromium.launch({ headless: true });
const identity = { id: "synthetic-user-workflow", token: "synthetic-access-workflow" };
const workflowId = "95000000-1000-4000-8000-000000000001";
const authRequests = [];
const restRequests = [];
const functionRequests = [];
const pageErrors = [];
let enqueueAccepted = false;
let runReadsAfterEnqueue = 0;

function user() {
  return {
    id: identity.id,
    aud: "authenticated",
    role: "authenticated",
    email: "workflow@example.test",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function corsHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "apikey, authorization, content-type, x-client-info, x-supabase-api-version",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-max-age": "600",
  };
}

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("https://example.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const origin = "http://127.0.0.1:4176";
    const path = url.pathname;
    const method = request.method();
    const authorization = request.headers().authorization ?? "";

    if (path.startsWith("/auth/v1/")) {
      authRequests.push({ method, path, authorization });
      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders(origin) });
        return;
      }
      if (path.endsWith("/token") && url.searchParams.get("grant_type") === "password") {
        const body = request.postDataJSON();
        if (body.email !== "workflow@example.test" || body.password !== "synthetic-password-123") {
          await route.fulfill({
            status: 400, contentType: "application/json", headers: corsHeaders(origin),
            body: JSON.stringify({ code: "invalid_credentials", message: "Invalid login credentials" }),
          });
          return;
        }
        await route.fulfill({
          status: 200, contentType: "application/json", headers: corsHeaders(origin),
          body: JSON.stringify({
            access_token: identity.token,
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: "synthetic-refresh-workflow",
            user: user(),
          }),
        });
        return;
      }
      if (path.endsWith("/user") && method === "GET" && authorization === `Bearer ${identity.token}`) {
        await route.fulfill({ status: 200, contentType: "application/json", headers: corsHeaders(origin), body: JSON.stringify(user()) });
        return;
      }
      if (path.endsWith("/logout")) {
        await route.fulfill({ status: 204, headers: corsHeaders(origin), body: "" });
        return;
      }
      await route.fulfill({ status: 404, contentType: "application/json", headers: corsHeaders(origin), body: JSON.stringify({ message: "Unmocked auth endpoint" }) });
      return;
    }

    if (path.startsWith("/rest/v1/")) {
      restRequests.push({ method, path, authorization });
      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders(origin) });
        return;
      }
      if (method !== "GET") {
        await route.fulfill({ status: 405, contentType: "application/json", headers: corsHeaders(origin), body: JSON.stringify({ message: "Browser table writes are forbidden in this test" }) });
        return;
      }
      if (authorization !== `Bearer ${identity.token}`) {
        await route.fulfill({ status: 401, contentType: "application/json", headers: corsHeaders(origin), body: JSON.stringify({ message: "Unauthorized synthetic identity" }) });
        return;
      }
      if (path.endsWith("/workflows")) {
        await route.fulfill({
          status: 200, contentType: "application/json", headers: corsHeaders(origin),
          body: JSON.stringify([{
            id: workflowId,
            name: "Synthetic E2E Workflow",
            description: "Browser-only workflow lifecycle test",
            status: "active",
            trigger_type: "manual",
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-02T00:00:00.000Z",
          }]),
        });
        return;
      }
      if (path.endsWith("/workflow_runs")) {
        if (!enqueueAccepted) {
          await route.fulfill({ status: 200, contentType: "application/json", headers: corsHeaders(origin), body: "[]" });
          return;
        }
        runReadsAfterEnqueue += 1;
        const status = runReadsAfterEnqueue >= 3 ? "succeeded" : "queued";
        await route.fulfill({
          status: 200, contentType: "application/json", headers: corsHeaders(origin),
          body: JSON.stringify([{
            id: "95000000-2000-4000-8000-000000000001",
            workflow_id: workflowId,
            status,
            created_at: "2026-01-02T00:00:00.000Z",
            started_at: status === "queued" ? null : "2026-01-02T00:00:01.000Z",
            finished_at: status === "succeeded" ? "2026-01-02T00:00:02.000Z" : null,
            attempt: 1,
          }]),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", headers: corsHeaders(origin), body: "[]" });
      return;
    }

    if (path.startsWith("/functions/v1/")) {
      if (method !== "OPTIONS") functionRequests.push({ method, path, authorization, body: method === "POST" ? request.postDataJSON() : null });
      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers: corsHeaders(origin) });
        return;
      }
      if (method !== "POST" || path !== "/functions/v1/simula-workflow-run-request" || authorization !== `Bearer ${identity.token}`) {
        await route.fulfill({ status: 401, contentType: "application/json", headers: corsHeaders(origin), body: JSON.stringify({ message: "Rejected synthetic function request" }) });
        return;
      }
      const body = request.postDataJSON();
      assert.equal(body.workflow_id, workflowId);
      assert.deepEqual(body.input, {});
      assert.match(body.request_id, /^[0-9a-f-]{36}$/i);
      enqueueAccepted = true;
      await route.fulfill({
        status: 200, contentType: "application/json", headers: corsHeaders(origin),
        body: JSON.stringify({
          ok: true,
          run: { id: body.request_id, status: "queued", created_at: "2026-01-02T00:00:00.000Z", replayed: false },
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", headers: corsHeaders(origin), body: JSON.stringify({ message: "Unmocked Supabase endpoint" }) });
  });

  const response = await page.goto(baseURL, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200);
  await page.getByRole("heading", { name: "Welcome back." }).waitFor();
  await page.getByLabel("Email address").fill("workflow@example.test");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password-123");
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await page.getByText("Authenticated session").waitFor();
  await page.getByText("WORKFLOW QUEUE ENABLED").waitFor();

  await page.getByRole("button", { name: "Pipelines" }).click();
  await page.getByText("Synthetic E2E Workflow").waitFor();
  await page.getByRole("button", { name: "View runs" }).click();
  await page.getByRole("button", { name: "Queue run" }).waitFor();
  await page.getByRole("button", { name: "Queue run" }).click();
  await page.getByText(/Run queued/).waitFor();
  await page.getByText("queued", { exact: true }).waitFor();
  await page.getByText("succeeded", { exact: true }).waitFor({ timeout: 12_000 });

  await page.getByRole("button", { name: "AI Runtime" }).click();
  await page.getByText("AI runtime is not active").waitFor();
  await page.getByText("No live agent registrations available").waitFor();
  for (const fabricatedAgent of ["Atlas", "Forge", "Sentinel", "Vault", "Pulse", "Quill"]) {
    assert.equal(await page.getByText(fabricatedAgent, { exact: true }).count(), 0, `sample agent ${fabricatedAgent} must not appear`);
  }

  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByText("Global event stream is not connected").waitFor();
  assert.equal(await page.getByText("06:41:02", { exact: true }).count(), 0, "fabricated log timestamps must not appear");

  assert.equal(functionRequests.length, 1, "one explicit user action must produce one enqueue call");
  assert.equal(functionRequests[0].method, "POST");
  assert.equal(functionRequests[0].body.workflow_id, workflowId);
  assert.ok(runReadsAfterEnqueue >= 3, "active run status must be refreshed until terminal state");
  assert.ok(restRequests.length > 0, "authenticated workflow data must be read");
  assert.ok(restRequests.every((item) => item.method === "GET" || item.method === "OPTIONS"), "browser must never mutate workflow tables directly");
  assert.ok(restRequests.every((item) => item.authorization === `Bearer ${identity.token}`), "workflow reads must use the signed-in user's token");
  assert.deepEqual(pageErrors, [], "workflow browser journey must not emit uncaught runtime errors");

  const mobileWidth = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(mobileWidth.document <= mobileWidth.viewport + 1, `mobile layout must not overflow horizontally: ${JSON.stringify(mobileWidth)}`);

  console.log("PASS: synthetic sign-in → authenticated workflow read → explicit enqueue → queued status → polled terminal status; no browser table writes; no uncaught errors; mobile viewport has no horizontal overflow");
  await context.close();
} finally {
  await browser.close();
}
