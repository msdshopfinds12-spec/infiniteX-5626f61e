# Phase 3D-2 — Frontend Security Hardening

## Scope

This phase hardens the existing browser API boundary and improves baseline touch and keyboard accessibility. It does not connect a backend, enable AI providers, add authentication, or change infrastructure.

## Implemented changes

### API request boundary

- Preserves HTTPS outside localhost and same-origin path enforcement.
- Preserves omitted credentials, rejected redirects, and no-store caching.
- Keeps the HTTP method allowlist and avoids implicit retries.
- Enforces a configurable request JSON byte limit (default 1,000,000 bytes).
- Enforces a configurable response byte limit (default 2,000,000 bytes).
- Rejects oversized responses from a valid Content-Length header before reading.
- Enforces the response limit while streaming when Content-Length is absent or inaccurate.
- Cancels the response reader when the streaming limit is exceeded.
- Accepts application/json and application/*+json media types; rejects lookalike media types.
- Uses fatal UTF-8 decoding before JSON parsing.
- Preserves stable error codes for timeout, caller abort, HTTP, network, malformed JSON, invalid contracts, and size-limit failures.
- Keeps response bodies out of user-facing errors.

### UI accessibility baseline

- Standardizes primary navigation, icon controls, and buttons to at least 44 CSS pixels.
- Improves visible keyboard focus for buttons, inputs, links, and button-role elements.
- Preserves reduced-motion support and existing responsive layout rules.

## Security boundaries not solved by this phase

- Browser-side checks do not replace server-side authorization, validation, rate limiting, or request-size enforcement.
- The frontend must not contain AI provider master keys or privileged database credentials.
- Authentication, authorization, RLS, backend integration, AI tool permissions, provider budgets, and audit logging remain separate workstreams.
- Client-side payload limits reduce accidental memory pressure but do not guarantee protection against all decompression, proxy, or infrastructure-level resource exhaustion.
- No automatic retries are introduced. Any future retry policy must be restricted to safe/idempotent operations and designed with server idempotency controls.

## Verification plan

The API test suite includes regression coverage for:
- Request and response payload limits.
- Streaming response enforcement and cancellation.
- Exact JSON media-type handling and structured +json media types.
- Invalid UTF-8 and malformed JSON.
- Timeout and caller cancellation.
- Existing URL, method, contract, and fetch-default protections.

Required before release:
1. Run npm ci.
2. Run npm run lint.
3. Run npm test.
4. Run npm run build.
5. Run npm run test:e2e with the configured browser.
6. Review the generated CI run and confirm its head SHA matches this branch.
7. Perform manual Android viewport, keyboard, and screen-reader checks.

No test or release status is claimed by this document. Results must be recorded from actual CI execution.

## Release controls

- This work is isolated on branch fix/phase-3d2-frontend-security.
- Merge and deployment require separate human approval.
- Do not add paid services, secrets, migrations, or provider credentials as part of this phase.
