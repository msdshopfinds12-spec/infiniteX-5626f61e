# Infrastructure as Code & Container Readiness

**Status:** Readiness standard only. No infrastructure provider, IaC tool, container runtime or production resource is provisioned by this document.

## Decision rule
Choose the least-complex option that meets security, portability, reliability and zero-budget constraints. Do not add Terraform, Docker or Kubernetes by default. For a small managed application, reviewed provider configuration and reproducible CI may be safer and cheaper than operating extra infrastructure.

## Inventory before adoption
Record each resource, owner, environment, region, data classification, dependencies, cost/free-tier limits, backup method and deletion/recovery procedure.

## IaC acceptance criteria
- Declarative source is versioned and peer reviewed.
- Plan/preview is generated before any apply.
- State is encrypted, access-controlled, backed up and locked against concurrent writes.
- Secrets are referenced from an approved secret store, never embedded in source/state outputs.
- Drift detection is read-only by default.
- Least-privilege provider credentials are scoped to the intended environment.
- Destructive changes require explicit human approval.
- A tested recovery path exists for state loss and partial apply.

## Container acceptance criteria (only if containers are justified)
- Pin base images by digest where practical and update through review.
- Use multi-stage builds and minimal runtime images.
- Run as a non-root user; drop unnecessary Linux capabilities.
- Use read-only filesystems where compatible; set CPU/memory limits.
- Never bake credentials into image layers or build arguments.
- Generate an SBOM and scan image/dependencies.
- Use health checks and graceful shutdown.
- Keep runtime configuration separate from immutable image artifacts.
- Document image provenance and rollback artifact.

## Required evidence
- Approved architecture decision record.
- Cost/free-tier impact assessment.
- Successful non-production plan/apply or image build/scan.
- Security review and recovery drill.
- Exact commit and CI run.

## Explicit blockers
No production infrastructure apply/destroy, container deployment, network/DNS modification, database migration or paid resource activation without separate explicit approval.
