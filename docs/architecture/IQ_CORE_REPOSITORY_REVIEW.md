# IQ Core repository review and InfiniteX integration decision

Review date: 2026-11-19

## Source examined

- Repository: https://github.com/msdshopfinds12-spec/msdshopfinds12-spec-infiniteGX.7-IQ-Core
- Default branch: `main`
- Reviewed source commit: `a0c81d1b7f691066320bf9dfd467ec828f0d11fc`
- Visibility: private
- Tree examined: all 15 paths returned by the recursive Git tree.
- Files read: README, three implementation modules and all three unit-test modules.

## Findings

The repository is a small Python standard-library foundation, not a complete autonomous operating system.

1. `intelligence/plugins/plugin_manager.py`: explicit in-process handler registry and caller-supplied permission-set check. It does not sandbox handlers. Permission sets are trusted inputs; the module does not authenticate their issuer.
2. `runtime/system_bus.py`: synchronous in-process dispatch; subscriber exceptions are isolated. It is not a durable or distributed event broker. Event payload copying is shallow.
3. `intelligence/learning/feedback_loop.py`: thread-safe in-memory feedback records and human-review status. Records are unbounded and non-durable; there is no tenant isolation or retention enforcement.
4. Tests cover basic registration, permission checks, event dispatch/failure isolation and feedback review. They do not establish production security, concurrency guarantees or durable behavior.
5. README recommends Python 3.10+ and standard-library tests via `python -m unittest discover -s tests -v`.
6. README links `docs/IQ_ARCHITECTURE.md`, but that path was absent from the complete recursive tree.
7. No LICENSE, LICENSE.md, LICENSE.txt or COPYING file was present in the complete returned tree. Private access is not a license grant.

## Decision

**DO NOT COPY OR EXECUTE IQ Core source in InfiniteX yet.** The source license and explicit cross-repository reuse authorization are not verified. No IQ Core source file has been copied into InfiniteX.

The InfiniteX implementation branch now contains an independently authored, metadata-only adapter contract. It requires source repository, full source commit, explicit license and owner-reuse booleans, runtime, capability allowlist, no network, and a USD 0 cost ceiling. It cannot load, execute or enable adapters.

## Known future hardening before any code reuse

- Obtain and record an explicit license or written owner authorization for cross-repository reuse.
- Add tenant/context-bound authorization issued by trusted host code; do not trust caller-supplied permission strings.
- Add plugin execution isolation and resource/time limits if executable plugins are ever supported.
- Bound feedback storage, add retention/deletion policy, tenant scoping and durable storage only after a separately approved backend plan.
- Deep-freeze or schema-validate event payloads and define event versioning/backpressure if asynchronous use is needed.
- Add concurrency, malformed-input and adversarial tests.
- Run the source repository's test suite in a controlled environment before considering a port.

## ₱0 integration path

The safest first integration is a future local Python worker behind a narrow JSON protocol, with no network access by default and no arbitrary shell execution. That worker remains disabled until license, compatibility, threat-model and test gates pass. The current TypeScript adapter registry is only a metadata contract, not a running Python bridge.
