/** Deny-by-default authorization policy primitives shared with Node tests. */
export const POLICY_UNAVAILABLE_CODE = "POLICY_UNAVAILABLE";

/** The role/membership source is not yet verified, so no capability may be granted. */
export function createPolicyUnavailablePayload() {
  return Object.freeze({
    ok: false,
    error: POLICY_UNAVAILABLE_CODE,
    permissions: Object.freeze([]),
  });
}

/** The initial authorization contract intentionally accepts no caller-controlled claims. */
export function isEmptyAuthorizationRequest(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === 0;
}
