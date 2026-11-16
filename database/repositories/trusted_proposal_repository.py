"""Tenant-scoped persistence operations for trusted proposals."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from database.models.proposal import TrustedProposal


class TrustedProposalRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, proposal: TrustedProposal) -> TrustedProposal:
        self._session.add(proposal)
        self._session.flush()
        return proposal

    def get(self, *, tenant_id: str, proposal_id: str) -> TrustedProposal | None:
        statement = select(TrustedProposal).where(
            TrustedProposal.tenant_id == tenant_id,
            TrustedProposal.proposal_id == proposal_id,
        )
        return self._session.scalar(statement)
