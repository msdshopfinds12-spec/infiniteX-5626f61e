import { createOpaqueToken, equalTokenDigests, hashOpaqueToken } from "./opaque-token.mjs";

export function createCsrfToken() {
  const token = createOpaqueToken();
  return Object.freeze({ token, tokenHash: hashOpaqueToken(token) });
}

export function verifyCsrfToken({ token, expectedTokenHash }) {
  if (typeof token !== "string" || typeof expectedTokenHash !== "string") {
    return false;
  }

  try {
    return equalTokenDigests(hashOpaqueToken(token), expectedTokenHash);
  } catch {
    return false;
  }
}
