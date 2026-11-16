# InfiniteX Self-Hosting Security Baseline

Status: design baseline; enforcement is not yet implemented or verified.

## Identity and access
Default-deny protected routes. Authenticate and authorize every resource. Use secure HttpOnly SameSite cookies and CSRF defenses. Rate-limit login and recovery. Rotate and revoke sessions. Separate migration and runtime database roles.

## Application
Validate inputs at API boundaries. Parameterize SQL. Set request limits and timeouts. Restrict CORS. Use security headers and generic external errors. Review and pin dependencies. Treat AI output and tool arguments as untrusted.

## Host and containers
Run as non-root. Use minimal maintained images. Drop unnecessary capabilities. Avoid privileged containers and host Docker socket mounts. Keep PostgreSQL on a private network without a public port. Use firewall allowlists, TLS, SSH keys and timely OS updates on any public host. Set CPU, memory, disk and process limits.

## Secrets and data
Keep secrets outside Git and frontend bundles. Separate development and production credentials. Encrypt backups and restrict restore access. Minimize personal data and define retention/deletion policies. Redact authorization headers, cookies, passwords, API keys and sensitive provider payloads.

## Billing
Mock-only until separately authorized. Never trust client success redirects. Future provider webhooks require signature, freshness, amount, currency, merchant and idempotency validation. Preserve append-only financial events.

## AI agents
Use explicit tool allowlists and scoped credentials. Require human approval for shell execution, code writes, migrations, public publishing and deployment. Enforce per-user quotas, budgets, timeouts and output limits. Model output cannot change its own permissions or bypass approval gates.

## Verification
Every control is NOT TESTED until runtime evidence demonstrates enforcement. Documentation is not proof of implementation.
