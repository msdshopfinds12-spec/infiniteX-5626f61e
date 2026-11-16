import test from "node:test";
import assert from "node:assert/strict";
import { validateOidcDiscovery } from "../../scripts/auth/validate-oidc-discovery.mjs";

const issuer = "https://id.example.test/realms/infiniteX";
const valid = {
  issuer,
  authorization_endpoint: "https://id.example.test/realms/infiniteX/protocol/openid-connect/auth",
  token_endpoint: "https://id.example.test/realms/infiniteX/protocol/openid-connect/token",
  jwks_uri: "https://id.example.test/realms/infiniteX/protocol/openid-connect/certs",
  id_token_signing_alg_values_supported: ["RS256"],
  code_challenge_methods_supported: ["S256"],
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
};

test("accepts discovery metadata matching the configured issuer and security profile", () => {
  assert.deepEqual(validateOidcDiscovery(valid, issuer), { ok: true, errors: [] });
});

test("rejects issuer mismatch", () => {
  const result = validateOidcDiscovery({ ...valid, issuer: "https://attacker.test" }, issuer);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("exactly match")));
});

test("rejects endpoint origins not explicitly trusted", () => {
  const result = validateOidcDiscovery({
    ...valid,
    jwks_uri: "https://attacker.test/keys",
  }, issuer);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("allowlist")));
});

test("rejects HTTP endpoints outside explicit loopback POC mode", () => {
  const result = validateOidcDiscovery({
    ...valid,
    token_endpoint: "http://id.example.test/token",
  }, issuer);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("HTTPS")));
});

test("permits HTTP only for explicit localhost POC endpoints", () => {
  const localIssuer = "http://localhost:8080/realms/test";
  const localMetadata = {
    ...valid,
    issuer: localIssuer,
    authorization_endpoint: "http://localhost:8080/auth",
    token_endpoint: "http://localhost:8080/token",
    jwks_uri: "http://localhost:8080/keys",
  };
  assert.equal(
    validateOidcDiscovery(localMetadata, localIssuer, { allowInsecureLocalhost: true }).ok,
    true,
  );
});

test("rejects missing PKCE S256 support", () => {
  const result = validateOidcDiscovery({
    ...valid,
    code_challenge_methods_supported: ["plain"],
  }, issuer);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("PKCE S256")));
});

test("rejects none and non-asymmetric-only signing algorithms", () => {
  const result = validateOidcDiscovery({
    ...valid,
    id_token_signing_alg_values_supported: ["none", "HS256"],
  }, issuer);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("none")));
});

test("rejects non-object metadata", () => {
  assert.equal(validateOidcDiscovery(null, issuer).ok, false);
  assert.equal(validateOidcDiscovery([], issuer).ok, false);
});

test("rejects credential-bearing and fragment-bearing endpoint URLs", () => {
  const result = validateOidcDiscovery({
    ...valid,
    authorization_endpoint: "https://user:pass@id.example.test/auth#fragment",
  }, issuer);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("credentials or a fragment")));
});
