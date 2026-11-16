# Human-Gated Self-Code Engineering

## Purpose

InfiniteX may eventually use AI models to propose code changes. Generated code is
untrusted input. The first-party policy layer must validate a proposal before a
human considers applying it. This foundation is deliberately narrower than an
autonomous coding agent.

## Current implementation

- `iq_core/agents/code_change_policy.py` validates branch namespace, protected
  branches, file paths, repository-control paths, sensitive paths, duplicate
  paths, secret-like content, and proposal size.
- `iq_core/agents/coding_agent.py` can evaluate a structured proposal supplied
  in an agent request and return a deterministic policy decision.
- `iq_core/agents/proposal_fingerprint.py` computes a stable SHA-256 digest
  over the proposal ID, target branch, rationale, policy version, and sorted
  file paths and contents. The coding agent returns this digest for proposals
  that pass screening.
- `iq_core/agents/approval_gate.py` verifies short-lived HMAC-signed approval
  evidence bound to the exact digest, branch, file set, reviewer identifier,
  and policy version. It verifies evidence only; it does not issue approvals,
  authenticate a reviewer, or apply a patch.
- `tests/unit/test_code_change_policy.py` and the coding-agent tests cover the
  safety boundaries.
- A valid proposal returns `REVIEW_REQUIRED`, not `APPROVED`.
- The policy never writes files, executes generated code, creates commits, or
  opens pull requests.

## Required future workflow

1. **INSPECT** — read repository state, branch, file ownership, and applicable
   architecture rules.
2. **PLAN** — produce a bounded change plan with affected paths, rationale,
   risks, rollback notes, and test strategy.
3. **PROPOSE** — produce a patch as inert data. Treat all generated content as
   untrusted.
4. **SCREEN** — run deterministic policy checks, secret scanning, path checks,
   dependency/license review, and static analysis.
5. **HUMAN APPROVAL** — require an authenticated, explicit approval bound to
   the exact proposal digest, target branch, file list, policy version, reviewer,
  and expiry. Approval evidence must be signed by a trusted server-side service only after
  authenticating an authorized human reviewer. The verification key must stay
  in that trusted service's secret store; never place it in a client, model
  prompt, repository file, or log. A digest alone is not proof of identity.
6. **APPLY** — only a separate trusted Git integration may write the approved
   patch. Re-read the branch head and use compare-and-swap semantics to avoid
   overwriting concurrent work.
7. **TEST** — run isolated tests and security checks against the exact commit.
8. **REVIEW** — inspect the complete diff and test evidence. Failed or missing
   checks block promotion.
9. **RELEASE APPROVAL** — deployment, merge, migrations, billing, and public
   release require separate explicit authorization.

## Non-negotiable invariants

- Never allow generated code to approve itself.
- Never treat a model's claim of successful testing as test evidence.
- Never execute generated shell commands, SQL, Python, or JavaScript as part
  of proposal screening.
- Never expose API keys, tokens, private keys, or environment values to model
  prompts or logs.
- Never allow a prompt, repository file, issue comment, or tool output to
  override system policy or branch restrictions.
- Never apply a patch to `main` or `phase-9/capability-mesh` through this
  workflow.
- Do not enable a paid model or assume a hosted free tier is unlimited.
- Keep an audit record of proposal digest, reviewer identity, approval time,
  policy version, commit SHA, CI run, and final disposition.

## Important limitations

The current validator and proposal fingerprint are first-pass controls, not a
complete security scanner or approval service. A SHA-256 digest detects changes
when compared against a trusted previously approved digest; it does not
authenticate the approver or authorize an apply operation. The HMAC verifier
requires an externally managed key of at least 32 bytes and accepts approvals
with a maximum 15-minute lifetime. Production key custody, reviewer identity
and authorization, key rotation, replay prevention, and a trusted apply
service remain integration requirements. Secret-pattern matching can miss unknown formats
and can produce false positives. It does not parse ASTs, prove code safety,
verify dependency licenses, sandbox execution, or establish that a patch is
correct. A separate review and test system remains mandatory.

The CodingAgent currently validates supplied proposals only. It does not
generate code with a language model because no model provider is configured.
The mock provider and local keyword rules are not generative AI.

## Language and runtime boundaries

- Python: policy, orchestration, agent contracts, backend and tests.
- TypeScript: frontend application and typed client contracts.
- SQL: database schema, tenant isolation and row-level security.
- YAML: CI workflows and declarative automation.
- Shell: reviewed developer scripts only; never execute model-provided commands
  automatically.
- JSON: versioned request, proposal and result contracts.

Do not add languages merely to make the architecture appear advanced. Choose
the smallest maintainable stack that meets verified requirements.
