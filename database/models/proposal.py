"""Immutable trusted proposal registry persistence model."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Index, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from database.models.base import Base


class TrustedProposal(Base):
    """Server-owned proposal facts used by future approval verification.

    This row is immutable after insertion. It records the exact repository,
    target branch, base commit, canonical digest, file manifest and policy
    version. It does not itself grant approval or authorize patch execution.
    """

    __tablename__ = "trusted_proposals"
    __table_args__ = (
        CheckConstraint("repository_id > 0", name="ck_trusted_proposals_repo_id"),
        CheckConstraint("base_commit_sha ~ '^[0-9a-f]{40}$'",
                        name="ck_trusted_proposals_base_sha"),
        CheckConstraint("proposal_digest ~ '^[0-9a-f]{64}$'",
                        name="ck_trusted_proposals_digest"),
        CheckConstraint(
            "jsonb_typeof(file_manifest) = 'array' AND jsonb_array_length(file_manifest) > 0",
            name="ck_trusted_proposals_manifest_array",
        ),
        CheckConstraint("fingerprint_schema_version > 0",
                        name="ck_trusted_proposals_fingerprint_version"),
        Index("ix_trusted_proposals_tenant_repo_created",
              "tenant_id", "repository_id", "created_at"),
        Index("ix_trusted_proposals_tenant_digest", "tenant_id", "proposal_digest"),
    )

    proposal_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    repository_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    repository_full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_branch: Mapped[str] = mapped_column(String(255), nullable=False)
    base_commit_sha: Mapped[str] = mapped_column(String(40), nullable=False)
    proposal_digest: Mapped[str] = mapped_column(String(64), nullable=False)
    file_manifest: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    policy_version: Mapped[str] = mapped_column(String(64), nullable=False)
    fingerprint_schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
