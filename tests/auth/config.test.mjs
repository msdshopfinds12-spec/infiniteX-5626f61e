import test from "node:test";
import assert from "node:assert/strict";
import { loadAuthConfig } from "../../server/auth/config.mjs";

const validEnv = {
  AUTH_ISSUER_URL: "https://identity.example.test/realms/infiniteX",
  AUTH_CLIENT_ID: "infiniteX-bff",
  AUTH_REDIRECT_URI: "https://app.example.test/auth/callback",
  AUTH_ALLOWED_ORIGINS: "https://identity.example.test,https://app.example.test",
};

test("loads a valid HTTPS server authentication configuration", () => {
  const result = loadAuthConfig(validEnv);
  assert.equal(result.ok, true);
  assert.equal(result.config.clientId, "infiniteX-bff");
  assert.deepEqual(result.config.allowedOrigins, [
    "https://identity.example.test",
    "https://app.example.test",
  ]);
  assert.equal(Object.isFrozen(result.config), true);
});

test("rejects missing required values without returning partial configuration", () => {
  const result = loadAuthConfig({});
  assert.equal(result.ok, false);
  assert.equal("config" in result, false);
  assert.ok(result.errors.some((error) => error.includes("AUTH_ISSUER_URL")));
});

test("rejects issuer query strings and URL fragments", () => {
  const result = loadAuthConfig({
    ...validEnv,
    AUTH_ISSUER_URL: "https://identity.example.test/realm?tenant=other",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("query string")));
});

test("rejects redirect origins absent from the explicit allowlist", () => {
  const result = loadAuthConfig({
    ...validEnv,
    AUTH_REDIRECT_URI: "https://attacker.example.test/callback",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("AUTH_REDIRECT_URI origin")));
});

test("rejects credentials and fragments in configured URLs", () => {
  const result = loadAuthConfig({
    ...validEnv,
    AUTH_REDIRECT_URI: "https://user:pass@app.example.test/callback#token",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("credentials or a fragment")));
});

test("allows HTTP only for explicit loopback development configuration", () => {
  const localEnv = {
    AUTH_ISSUER_URL: "http://localhost:8080/realms/dev",
    AUTH_CLIENT_ID: "infiniteX-local",
    AUTH_REDIRECT_URI: "http://localhost:5173/auth/callback",
    AUTH_ALLOWED_ORIGINS: "http://localhost:8080,http://localhost:5173",
  };
  assert.equal(loadAuthConfig(localEnv).ok, false);
  assert.equal(loadAuthConfig(localEnv, { allowInsecureLocalhost: true }).ok, true);
});

test("rejects allowlist entries containing paths", () => {
  const result = loadAuthConfig({
    ...validEnv,
    AUTH_ALLOWED_ORIGINS: "https://identity.example.test/path,https://app.example.test",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("origins without paths")));
});
