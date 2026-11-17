# Phase 4M.1B — Browser / Server Import Boundary

## Objective

Prevent trusted server-only modules from entering the browser dependency graph through direct or transitive static imports.

## Guard behavior

- Starts at `src/main.tsx` and follows local TypeScript/JavaScript import and re-export edges.
- Audits static imports, re-exports, literal dynamic imports, and literal CommonJS require calls.
- Rejects Node.js built-in modules in the browser graph.
- Rejects imports into `src/lib/ai/` and `apps/api/`.
- Rejects unresolved relative source imports, imports escaping the repository root, and non-literal dynamic import/require expressions.
- Uses the repository's existing TypeScript parser dependency; no new package or lockfile changes.

## Limits

This is a source-level dependency guard, not a full bundler output inspection, runtime sandbox, secrets scanner, or proof that every Vite alias is correctly resolved. A future phase should inspect Vite's resolved module graph and production bundle metadata. Any new alias convention must be explicitly added to this scanner and its tests.

## Validation

The tests include safe graph, indirect server-only import, Node built-in import, non-literal dynamic import, unresolved import, root escape, and actual repository entrypoint cases.

## Security posture

No AI provider, database, authentication, deployment, secrets, or write-capable integration is enabled by this change.
