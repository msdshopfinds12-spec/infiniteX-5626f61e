# Public Supabase Configuration Guard

**Status:** Implemented as an isolated validation utility; not wired to an SDK or auth flow.

## Purpose

Validate the two intended browser-visible Supabase settings before creating a client:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The utility accepts HTTPS project URLs and local HTTP URLs for local development only. It rejects malformed URLs, URL credentials/query/hash/path components, and known privileged key formats.

## Security boundary

Vite embeds `VITE_*` values in public browser assets. A publishable/legacy anon key is not an authorization boundary; PostgreSQL RLS and server-side authorization remain mandatory.

Never expose a Supabase service-role key, `sb_secret_*` key, worker shared secret, webhook secret, or other privileged credential through Vite configuration.

This validator is defense-in-depth, not a secret scanner or proof that a key is authorized. It does not decode arbitrary JWTs or guarantee the configured key's provenance.

## Tests

Node's built-in test runner covers valid publishable configuration, legacy anon-key compatibility, missing values, malformed/insecure URLs, URL credential/query/hash/path rejection, local development HTTP, and known privileged key formats.

## Remaining work

- Install and pin official `@supabase/supabase-js` with a generated lockfile.
- Call this validator from the real application bootstrap.
- Add AuthProvider/session lifecycle and typed data services.
- Add isolated RLS integration tests and Android/browser QA.

Until those steps are complete, the application remains in explicitly disclosed demo mode.
