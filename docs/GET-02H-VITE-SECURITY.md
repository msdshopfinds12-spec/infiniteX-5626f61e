# GET-02H — Vite Security Patch Plan

## Objective

Remediate the Vite dev-server security advisory with the smallest compatible dependency change, while preserving the React dashboard and GET-02G numeric engine.

## Verified baseline

- Locked Vite version: 5.4.21
- Locked React plugin version: 4.7.0
- Existing package manifest allows Vite 5 and plugin-react 4.
- Existing Vite config sets `server.host: true`, which exposes the development server on network interfaces.
- Existing CI runs on Node.js 20 and executes TypeScript verification, numeric tests, and production build.

## Security finding

GitHub advisory GHSA-p4f5-76q4-ffq7 affects Vite versions 4.0.0 through 6.4.5, with 6.4.6 as the patched release for the Vite 6 line. The advisory's impact condition includes projects that expose the Vite dev server through `--host` or `server.host`.

Source: https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7

## Selected remediation

Prefer the minimum compatible patched line first:

- Vite: `^6.4.6`
- `@vitejs/plugin-react`: `^4.7.0`

The currently locked React plugin 4.7.0 declares compatibility with Vite 6, avoiding an unnecessary plugin major upgrade. This is a Vite 5 → 6 major migration, but substantially smaller than moving directly to Vite 8.

Official plugin package/version reference: https://www.npmjs.com/package/@vitejs/plugin-react

## Why not jump directly to Vite 8?

Vite 8 uses Rolldown and Oxc-based tooling and has a higher Node.js minimum (20.19+ or 22.12+). Its React plugin major line is also different. That is a valid later modernization project, but not the minimum-risk security patch.

Vite 8 migration reference: https://vite.dev/guide/migration

## Verification gates

1. Regenerate package-lock from package.json in CI.
2. Run `npm ci` to prove lockfile reproducibility.
3. Confirm resolved Vite, plugin-react, and esbuild versions.
4. Run `npm run lint`.
5. Run `npm test` (19 numeric regression tests).
6. Run `npm run build`.
7. Run `npm audit`; record all severities and require zero high/critical findings.
8. Review the resulting lockfile before any merge.

## Safety and scope

- This branch is isolated from `main`.
- Do not merge or deploy automatically.
- Do not use `npm audit fix --force`.
- Do not modify dashboard UI or numeric engine implementation in this task.
- The generated lockfile is uploaded as a short-lived CI artifact for review.
- A successful build does not by itself establish production security certification.

## Rollback

If Vite 6 compatibility fails, revert only this branch's dependency and lockfile changes. Keep the original GET-02G branch and its passing regression suite intact.
