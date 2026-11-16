"""Contract tests for the trusted proposal persistence model."""
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from database.models import Base, TrustedProposal


def test_trusted_proposal_is_registered_in_metadata():
    assert Base.metadata.tables["trusted_proposals"] is TrustedProposal.__table__


def test_trusted_proposal_persists_all_approval_binding_fields():
    columns = TrustedProposal.__table__.columns
    expected = {
        "tenant_id", "proposal_id", "repository_id", "repository_full_name",
        "target_branch", "base_commit_sha", "proposal_digest", "file_manifest",
        "policy_version", "fingerprint_schema_version", "created_by", "created_at",
    }
    assert expected.issubset(set(columns.keys()))


def test_trusted_proposal_has_composite_tenant_scoped_primary_key():
    primary_key = {column.name for column in TrustedProposal.__table__.primary_key}
    assert primary_key == {"tenant_id", "proposal_id"}


def test_trusted_proposal_has_digest_and_manifest_constraints():
    names = {constraint.name for constraint in TrustedProposal.__table__.constraints}
    assert {
        "ck_trusted_proposals_repo_id",
        "ck_trusted_proposals_repo_name",
        "ck_trusted_proposals_branch",
        "ck_trusted_proposals_base_sha",
        "ck_trusted_proposals_digest",
        "ck_trusted_proposals_manifest_array",
        "ck_trusted_proposals_fingerprint_version",
    }.issubset(names)


def test_trusted_proposal_uses_postgresql_jsonb_manifest():
    assert isinstance(TrustedProposal.__table__.c.file_manifest.type, postgresql.JSONB)


def test_trusted_proposal_ddl_compiles_for_postgresql():
    ddl = str(CreateTable(TrustedProposal.__table__).compile(dialect=postgresql.dialect()))
    assert "trusted_proposals" in ddl
    assert "proposal_digest" in ddl
    assert "JSONB" in ddl
