"""Trusted proposal registration and retrieval; never approves or executes code."""
from __future__ import annotations

import hashlib
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.proposals.fingerprint import (
    DEFAULT_POLICY_VERSION, FINGERPRINT_SCHEMA_VERSION, proposal_fingerprint,
)
from backend.app.proposals.schemas import TrustedProposalCreate
from database.models.proposal import TrustedProposal
from database.repositories.trusted_proposal_repository import TrustedProposalRepository
from database.tenant_context import set_tenant_context


class ProposalConflictError(Exception):
    """The tenant already registered this proposal identifier."""


class TrustedProposalService:
    """Create immutable server-owned proposal facts inside caller transaction.

    The caller must authenticate the principal, derive tenant_id and actor_id
    from verified server-side identity, and own commit/rollback. This service
    deliberately does not commit, expose HTTP routes, approve, or execute.
    """

    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = TrustedProposalRepository(session)

    def register(self, *, tenant_id: str, actor_id: str,
                 payload: TrustedProposalCreate) -> TrustedProposal:
        try:
            tenant = str(UUID(tenant_id))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValueError("tenant_id must be a valid UUID") from exc
        if not isinstance(actor_id, str) or not actor_id.strip() or len(actor_id) > 200:
            raise ValueError("actor_id must be a non-empty authenticated identity")
        if payload.policy_version != DEFAULT_POLICY_VERSION:
            raise ValueError("unsupported proposal policy version")

        set_tenant_context(self._session, tenant)
        manifest = []
        for item in payload.files:
            content_bytes = item.content.encode("utf-8")
            manifest.append({
                "path": item.path,
                "sha256": hashlib.sha256(content_bytes).hexdigest(),
                "byte_length": len(content_bytes),
            })
        digest = proposal_fingerprint(
            tenant_id=tenant, proposal_id=payload.proposal_id,
            repository_id=payload.repository_id,
            repository_full_name=payload.repository_full_name,
            target_branch=payload.target_branch,
            base_commit_sha=payload.base_commit_sha,
            files=manifest, policy_version=payload.policy_version,
        )
        proposal = TrustedProposal(
            tenant_id=tenant,
            proposal_id=payload.proposal_id,
            repository_id=payload.repository_id,
            repository_full_name=payload.repository_full_name,
            target_branch=payload.target_branch,
            base_commit_sha=payload.base_commit_sha,
            proposal_digest=digest,
            file_manifest=manifest,
            policy_version=payload.policy_version,
            fingerprint_schema_version=FINGERPRINT_SCHEMA_VERSION,
            created_by=actor_id.strip(),
        )
        try:
            return self._repository.add(proposal)
        except IntegrityError as exc:
            raise ProposalConflictError("proposal identifier already exists or violates registry constraints") from exc

    def retrieve(self, *, tenant_id: str, proposal_id: str) -> TrustedProposal | None:
        try:
            tenant = str(UUID(tenant_id))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValueError("tenant_id must be a valid UUID") from exc
        set_tenant_context(self._session, tenant)
        return self._repository.get(tenant_id=tenant, proposal_id=proposal_id)
