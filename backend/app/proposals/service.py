"""Trusted proposal registration and retrieval; never approves or executes code."""
from __future__ import annotations
import hashlib
from uuid import UUID
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from backend.app.proposals.authority import RepositorySnapshotAuthority, assert_snapshot_matches_request
from backend.app.proposals.fingerprint import DEFAULT_POLICY_VERSION, FINGERPRINT_SCHEMA_VERSION, proposal_fingerprint
from backend.app.proposals.schemas import TrustedProposalCreate
from database.models.proposal import TrustedProposal
from database.repositories.trusted_proposal_repository import TrustedProposalRepository
from database.tenant_context import set_tenant_context

class ProposalConflictError(Exception):
    """The tenant already registered this proposal identifier."""

class TrustedProposalService:
    """Persist immutable proposal facts; caller owns auth and transaction."""
    def __init__(self, session: Session, *, repository_authority: RepositorySnapshotAuthority) -> None:
        if repository_authority is None:
            raise ValueError("trusted repository snapshot authority is required")
        self._session = session
        self._repository = TrustedProposalRepository(session)
        self._authority = repository_authority

    def register(self, *, tenant_id: str, actor_id: str, payload: TrustedProposalCreate) -> TrustedProposal:
        try:
            tenant = str(UUID(tenant_id))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValueError("tenant_id must be a valid UUID") from exc
        if not isinstance(actor_id, str) or not actor_id.strip() or len(actor_id) > 200:
            raise ValueError("actor_id must be a non-empty authenticated identity")
        if payload.policy_version != DEFAULT_POLICY_VERSION:
            raise ValueError("unsupported proposal policy version")

        verified = self._authority.resolve_snapshot(
            repository_id=payload.repository_id,
            repository_full_name=payload.repository_full_name,
            target_branch=payload.target_branch,
            base_commit_sha=payload.base_commit_sha,
        )
        assert_snapshot_matches_request(
            requested={
                "repository_id": payload.repository_id,
                "repository_full_name": payload.repository_full_name,
                "target_branch": payload.target_branch,
                "base_commit_sha": payload.base_commit_sha,
            }, verified=verified,
        )

        set_tenant_context(self._session, tenant)
        manifest = []
        for item in payload.files:
            raw = item.content.encode("utf-8")
            manifest.append({"path": item.path, "sha256": hashlib.sha256(raw).hexdigest(),
                             "byte_length": len(raw)})
        digest = proposal_fingerprint(
            tenant_id=tenant, proposal_id=payload.proposal_id,
            repository_id=verified.repository_id,
            repository_full_name=verified.repository_full_name,
            target_branch=verified.target_branch, base_commit_sha=verified.base_commit_sha,
            files=manifest, policy_version=payload.policy_version,
        )
        row = TrustedProposal(
            tenant_id=tenant, proposal_id=payload.proposal_id,
            repository_id=verified.repository_id,
            repository_full_name=verified.repository_full_name,
            target_branch=verified.target_branch, base_commit_sha=verified.base_commit_sha,
            proposal_digest=digest, file_manifest=manifest,
            policy_version=payload.policy_version,
            fingerprint_schema_version=FINGERPRINT_SCHEMA_VERSION,
            created_by=actor_id.strip(),
        )
        try:
            return self._repository.add(row)
        except IntegrityError as exc:
            raise ProposalConflictError("proposal identifier already exists or violates registry constraints") from exc

    def retrieve(self, *, tenant_id: str, proposal_id: str) -> TrustedProposal | None:
        try:
            tenant = str(UUID(tenant_id))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValueError("tenant_id must be a valid UUID") from exc
        set_tenant_context(self._session, tenant)
        return self._repository.get(tenant_id=tenant, proposal_id=proposal_id)
