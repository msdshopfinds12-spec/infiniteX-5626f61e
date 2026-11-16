# InfiniteX Secret Management Standard

## 1. Never commit

- Auth0 client secrets or management API tokens.
- AI provider API keys.
- Database URLs/passwords and service-role keys.
- GitHub personal access tokens or deployment tokens.
- MCP credentials, OAuth refresh tokens and browser storage state.
- Private signing keys, certificates or webhook secrets.

## 2. Configuration boundary

Vite variables prefixed with `VITE_` are public and are embedded in browser bundles. They may contain public identifiers and public API base URLs only. Never place secrets in `VITE_*`.

Backend secrets belong in the selected hosting provider's secret/environment manager. Local development uses an ignored `.env` file populated manually from a safe example. Do not read, print, commit or upload real `.env` values.

## 3. Handling rules

- Request only the credential needed for the approved task.
- Prefer OAuth with narrow scopes or short-lived credentials.
- Prefer project-specific and read-only tokens for audits.
- Never paste credentials into chat, issues, pull requests, source files or logs.
- Redact Authorization headers, cookies, API keys and database connection strings.
- Rotate credentials if exposure is suspected; rotation requires explicit approval and a service-impact plan.
- Keep separate development, staging and production credentials.
- Restrict secret access to the runtime that requires it.

## 4. Repository safeguards

- Keep `.env`, `.env.*` (except explicitly safe examples), private keys and local browser state ignored.
- Commit placeholders only, such as `.env.example`.
- Review diffs for accidental secrets before every commit.
- Run an approved secret scanner in CI.
- Do not assume a secret is safe merely because it is base64 encoded.

## 5. Incident response

If a secret appears in a repository or log: stop using it, notify the owner, identify exposure scope, obtain approval to revoke/rotate, remove it from active history where appropriate, and review access logs. Deleting a visible line does not invalidate a leaked credential.
