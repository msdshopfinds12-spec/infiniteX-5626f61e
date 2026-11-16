"""Create immutable, tenant-scoped trusted proposal registry."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_trusted_proposal_registry"
down_revision = "0003_durable_audit_approval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trusted_proposals",
        sa.Column("proposal_id", sa.String(100), nullable=False),
        sa.Column("tenant_id", sa.String(36), nullable=False),
        sa.Column("repository_id", sa.BigInteger(), nullable=False),
        sa.Column("repository_full_name", sa.String(255), nullable=False),
        sa.Column("target_branch", sa.String(255), nullable=False),
        sa.Column("base_commit_sha", sa.String(40), nullable=False),
        sa.Column("proposal_digest", sa.String(64), nullable=False),
        sa.Column("file_manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("policy_version", sa.String(64), nullable=False),
        sa.Column("fingerprint_schema_version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("tenant_id", "proposal_id",
                                name="pk_trusted_proposals"),
        sa.CheckConstraint("repository_id > 0", name="ck_trusted_proposals_repo_id"),
        sa.CheckConstraint("length(repository_full_name) BETWEEN 3 AND 255",
                           name="ck_trusted_proposals_repo_name"),
        sa.CheckConstraint("length(target_branch) BETWEEN 1 AND 255",
                           name="ck_trusted_proposals_branch"),
        sa.CheckConstraint("base_commit_sha ~ '^[0-9a-f]{40}$'",
                           name="ck_trusted_proposals_base_sha"),
        sa.CheckConstraint("proposal_digest ~ '^[0-9a-f]{64}$'",
                           name="ck_trusted_proposals_digest"),
        sa.CheckConstraint("jsonb_typeof(file_manifest) = 'array' AND jsonb_array_length(file_manifest) > 0",
                           name="ck_trusted_proposals_manifest_array"),
        sa.CheckConstraint("fingerprint_schema_version > 0",
                           name="ck_trusted_proposals_fingerprint_version"),
    )
    op.create_index(
        "ix_trusted_proposals_tenant_repo_created",
        "trusted_proposals",
        ["tenant_id", "repository_id", "created_at"],
    )
    op.create_index(
        "ix_trusted_proposals_tenant_digest",
        "trusted_proposals",
        ["tenant_id", "proposal_digest"],
    )

    op.execute("ALTER TABLE trusted_proposals ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE trusted_proposals FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY trusted_proposals_tenant_isolation
        ON trusted_proposals
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    """)
    op.execute("""
        CREATE FUNCTION reject_trusted_proposal_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'trusted_proposals is append-only';
        END;
        $$
    """)
    op.execute("""
        CREATE TRIGGER trg_trusted_proposals_append_only
        BEFORE UPDATE OR DELETE ON trusted_proposals
        FOR EACH ROW EXECUTE FUNCTION reject_trusted_proposal_mutation()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_trusted_proposals_append_only ON trusted_proposals")
    op.execute("DROP FUNCTION IF EXISTS reject_trusted_proposal_mutation()")
    op.execute("DROP POLICY IF EXISTS trusted_proposals_tenant_isolation ON trusted_proposals")
    op.drop_index("ix_trusted_proposals_tenant_digest", table_name="trusted_proposals")
    op.drop_index("ix_trusted_proposals_tenant_repo_created", table_name="trusted_proposals")
    op.drop_table("trusted_proposals")
