# Phase 2.1 — Vite security remediation status

Date: 2026-11-17
Branch: `feat/gh16-infiniteX-integration`
Scope: feature branch only; no merge or production deployment.

## Verified baseline

- The branch lockfile resolves Vite 5.4.21 and esbuild 0.21.5.
- Both `vite.config.js` and `vite.config.ts` previously set `server.host: true`.
- The npm audit step in the existing CI workflow is report-only (`continue-on-error: true`).
- The existing CI run for commit `36aa475a758d9f20337b380aab04c76f2a74fdf7` passed its overall workflow, but the audit step reported vulnerabilities.

## Mitigation committed

Both Vite config files now bind the development server explicitly to `127.0.0.1`.

This removes the explicit network-wide bind from these config files and reduces exposure of the affected development-server behavior. It is a mitigation, **not a substitute for upgrading the vulnerable Vite package**.

For remote development, use a platform-provided authenticated preview/tunnel rather than setting Vite's host to all interfaces.

## Dependency remediation — still pending

The installed Vite 5.4.21 is within the affected range for GHSA-p4f5-76q4-ffq7. The Vite maintainers list 6.4.6 as the patched release for the Vite 4–6 line:
https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7

The React plugin currently resolved by the lockfile is `@vitejs/plugin-react@4.7.0`; its peer dependency range includes Vite 6. This is a compatibility signal, not proof that the application build passes after the upgrade.

Do not manually edit the lockfile. Regenerate it with npm in a clean checkout after updating the Vite manifest, then verify:

```bash
npm install --save-dev vite@^6.4.6
npm ci
npm ls vite esbuild @vitejs/plugin-react
npm audit --audit-level=moderate
npm run lint
npm test
npm run build
```

If the audit still reports findings, inspect the exact advisory and dependency path before changing additional packages. Do not use `npm audit fix --force`.

## Verification gates

- Localhost-only config mitigation: committed; CI verification pending.
- Vite dependency upgrade: not performed.
- Lockfile regeneration: not performed.
- Post-upgrade npm audit: not performed.
- Full regression test after dependency changes: not performed.
- Merge, production deployment, migration, billing change, and destructive operations: not performed.

## Next step

Complete the dependency update and lockfile regeneration in a clean branch workspace, then require a fresh GitHub Actions run with an audit result that is not silently ignored.
