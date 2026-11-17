# Frontend API Boundary — Security Rules

## Trust model

Everything received from the browser, URL, network, local storage, or AI-generated output is untrusted. Client-side checks improve reliability and UX; they do not replace server-side authentication, authorization, input validation, or database policy enforcement.

## Required controls

1. Use HTTPS outside localhost.
2. Keep API paths on the configured origin.
3. Omit ambient browser credentials by default.
4. Reject redirects unless a reviewed use case explicitly requires them.
5. Bound request duration and support cancellation.
6. Validate response shape at runtime before using it as domain data.
7. Return stable, non-sensitive error codes; never echo server bodies or credentials into UI logs.
8. Do not automatically retry mutations.
9. Never embed provider keys, database service-role keys, or privileged tokens in frontend bundles.
10. Enforce identity, workspace membership, role checks, and resource ownership on the server.

## Future server requirements

- Authenticate every protected request.
- Derive user and workspace identity from verified server-side session/token claims, never from client-supplied role or owner fields.
- Apply workspace-scoped authorization to every read and mutation.
- Use PostgreSQL Row Level Security as defense in depth, with negative tests for cross-workspace access.
- Validate request schemas and enforce payload-size limits.
- Add rate limits, provider quotas, bounded timeouts and safe audit events.
- Redact credentials, personal data and provider prompts from routine logs.
- Require explicit approval for destructive operations, migrations, deployments, billing and AI-generated code execution.

## Known limitations

This frontend API client is not an authentication library, CSRF defense, authorization engine, secret manager, or substitute for backend validation. The current application remains a local/demo frontend until a server and its controls are implemented and independently tested.
