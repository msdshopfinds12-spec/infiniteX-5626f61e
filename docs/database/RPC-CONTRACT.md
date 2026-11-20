# Workflow RPC authorization contract

This contract records the intended authorization boundaries from the current security-audit handoff. It intentionally does not invent argument lists, return types, or overload identities; those must be extracted from the live catalog and committed as observed evidence.

## Known workflow functions

| Function | Intended boundary | Required verification |
|---|---|---|
| `public.simula_claim_workflow_runs` | User-triggered claim wrapper; reported to have an `authenticated` EXECUTE grant | Inspect all overloads and body; prove `auth.uid()` ownership validation; verify it cannot invoke privileged behavior for another user |
| `public.simula_claim_workflow_runs_internal` | Internal worker claim; reported restricted to `service_role` | Verify no PUBLIC/anon/authenticated EXECUTE; inspect SECURITY DEFINER owner and search_path; verify caller boundary |
| `public.simula_verify_worker_secret` | Worker-secret verification; reported SECURITY DEFINER with empty search_path | Verify exact configuration, owner, grants, input handling, constant-time secret comparison where applicable, and absence of secret disclosure |

## Authorization invariants

- Authenticated users may act only on workflows they own.
- Internal worker operations are not directly executable by anon or authenticated roles.
- SECURITY DEFINER functions use a fixed, safe search_path (prefer empty and fully qualify object names).
- Untrusted inputs are validated before privileged SQL operations.
- Function EXECUTE grants are explicit; do not assume revoking a grant is safe without tracing callers.
- RLS remains enabled and policies are tested for both positive and negative ownership cases.
- API-key records remain owner-scoped; key material is never returned to client roles.
- Workflow execution state cannot be directly updated by authenticated users unless an explicitly reviewed policy/function permits it.

## Evidence needed before enforcement

Capture for every overload: schema, function name, identity arguments, result type, language, owner, SECURITY DEFINER, volatility, proconfig/search_path, ACL (including implicit PUBLIC), and function definition hash. Also capture dependent functions and application call sites.

## Change policy

Do not alter grants or function bodies based solely on this document. A change requires a reviewed call graph, tests for anon/authenticated/service_role, and a separate approved migration. This PR is documentation and offline tooling only.
