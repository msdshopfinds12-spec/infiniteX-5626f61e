# Phase 53.2 — Dependency Audit and Development Server Exposure

Date: 2026-11-20

## Revision

- Repository: `msdshopfinds12-spec/infiniteX-5626f61e`
- Branch: `engineering/phase-52-1k-clean-room-replay-preparation`
- Reviewed application revision: `af0300ef2572aade8e5519ff964575710c98f5db`
- Application CI: [run 44766330652](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44766330652) — SUCCESS
- Database Contract Gate: [run 44766330665](https://github.com/msdshopfinds12-spec/infiniteX-5626f61e/actions/runs/44766330665) — IN PROGRESS when recorded

## Dependency audit — verified findings

A non-blocking `npm audit --json` step was added to Application CI. At the reviewed revision, the registry audit returned no audit transport error and reported:

- 1 moderate vulnerability: transitive `esbuild`, affected range `<=0.24.2`.
- 1 high vulnerability: direct development dependency `vite`, affected range `<=6.4.3`.
- 0 critical vulnerabilities.
- npm reported an available remediation path through Vite `8.3.8`, which is a major-version upgrade from the current Vite 5 line.

Relevant advisories:
- esbuild GHSA-67mh-4wv8-2f99: https://github.com/advisories/GHSA-67mh-4wv8-2f99
- Vite GHSA-4w7w-66w2-5vf9: https://github.com/advisories/GHSA-4w7w-66w2-5vf9

The esbuild advisory concerns cross-origin requests to its development server. The Vite advisory concerns path traversal in optimized dependency source-map handling. These findings are in the build/development toolchain; this audit alone does not establish exploitation of the deployed production app.

## Immediate hardening applied

The prior Vite config bound its dev server to all interfaces (`host: true`). It now defaults to loopback only:

```ts
server: {
  host: "127.0.0.1",
  port: 5173,
}
```

This reduces unsolicited LAN exposure during ordinary local development. If LAN access is intentionally needed for Android browser testing, the developer must explicitly opt in using Vite's CLI `--host` option and only on a trusted private network. This host restriction is defense-in-depth, not a substitute for upgrading vulnerable dependencies.

## Upgrade strategy — do not force blindly

The audit's suggested fix is a major Vite upgrade. Vite 8 requires Node.js 20.19+ or 22.12+; the CI runner used Node 22.23.5, so its runtime meets the documented requirement. The installed `@vitejs/plugin-react` line has a changelog entry adding Vite 8 to its peer dependency range in version 4.3.0, so the current 4.3.3 line is a plausible compatibility candidate.

Before changing the lockfile, perform a dedicated dependency-upgrade branch/review:
1. Upgrade Vite to a patched release (audit currently suggests 8.3.8).
2. Regenerate `package-lock.json` using npm; never hand-edit package integrity or dependency graph data.
3. Run `npm ci`, `npm audit`, TypeScript validation, app regression tests, and production build.
4. Review Vite 8 migration changes and confirm plugin peer dependency resolution.
5. Exercise dev server, preview, and deployed build behavior before marking the vulnerability resolved.

Do not use `npm audit fix --force` as a blind repair. Do not claim the vulnerabilities are fixed until a fresh audit reports zero applicable findings.

## CI evidence

At revision `af0300ef2572aade8e5519ff964575710c98f5db`, Application CI run 44766330652 completed successfully after the loopback configuration change and dependency audit step. The audit remains non-blocking by design, so a successful build does not mean dependency security is clean.

## Release boundary

No production deployment, database mutation, migration, merge, or billing change was performed. PR #77 remains open and draft.
