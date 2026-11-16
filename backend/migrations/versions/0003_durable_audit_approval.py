"""Add durable audit, approval nonce, and transactional outbox tables."""
from alembic import op
import sqlalchemy as sa

revision = "0003_durable_audit_approval"
down_revision = "0002_company_brain"
branch_labels = None
depends_on = None


def _tenant_policy(table: str, policy: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY {policy} ON {table}
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
        """
    )


def upgrade() -> None:
    op.create_table(
        "audit_stream_heads",
        sa.Column("tenant_id", sa.String(36), primary_key=True),
        sa.Column("stream_id", sa.String(200), primary_key=True),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_digest", sa.String(64), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_audit_stream_heads_tenant", "audit_stream_heads", ["tenant_id"]
    )

    op.create_table(
        "audit_events",
        sa.Column("event_id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), nullable=False),
        sa.Column("stream_id", sa.String(200), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor", sa.String(200), nullable=False),
        sa.Column("action", sa.String(200), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.String(200), nullable=False),
        sa.Column("outcome", sa.String(32), nullable=False),
        sa.Column("correlation_id", sa.String(100), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("previous_digest", sa.String(64), nullable=True),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.UniqueConstraint(
            "tenant_id", "stream_id", "sequence",
            name="uq_audit_event_stream_sequence",
        ),
    )
    op.create_index(
        "ix_audit_events_tenant_created", "audit_events", ["tenant_id", "created_at"]
    )
    op.create_index(
        "ix_audit_events_stream_sequence",
        "audit_events", ["tenant_id", "stream_id", "sequence"],
    )

    op.create_table(
        "approval_intents",
        sa.Column("intent_id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), nullable=False),
        sa.Column("request_digest", sa.String(64), nullable=False),
        sa.Column("signer_key_id", sa.String(200), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_approval_intents_tenant_status",
        "approval_intents", ["tenant_id", "status"],
    )
    op.create_index(
        "ix_approval_intents_tenant_expiry",
        "approval_intents", ["tenant_id", "expires_at"],
    )

    op.create_table(
        "consumed_approval_nonces",
        sa.Column("tenant_id", sa.String(36), primary_key=True),
        sa.Column("nonce_hash", sa.String(64), primary_key=True),
        sa.Column("intent_id", sa.String(36), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_consumed_nonces_tenant_expiry",
        "consumed_approval_nonces", ["tenant_id", "expires_at"],
    )

    op.create_table(
        "engineering_outbox",
        sa.Column("outbox_id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), nullable=False),
        sa.Column("event_type", sa.String(200), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_engineering_outbox_pending",
        "engineering_outbox", ["published_at", "created_at"],
    )
    op.create_index(
        "ix_engineering_outbox_tenant",
        "engineering_outbox", ["tenant_id", "created_at"],
    )

    _tenant_policy("audit_stream_heads", "audit_stream_heads_tenant_isolation")
    _tenant_policy("audit_events", "audit_events_tenant_isolation")
    _tenant_policy("approval_intents", "approval_intents_tenant_isolation")
    _tenant_policy("consumed_approval_nonces", "consumed_nonces_tenant_isolation")
    _tenant_policy("engineering_outbox", "engineering_outbox_tenant_isolation")

    # Prevent UPDATE/DELETE through ordinary table access. Superusers and owners
    # able to disable triggers remain outside this control; use restricted roles
    # and independently protected checkpoints for stronger tamper evidence.
    op.execute(
        """
        CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'audit_events is append-only';
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_audit_events_append_only
        BEFORE UPDATE OR DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation()
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_events_append_only ON audit_events")
    op.execute("DROP FUNCTION IF EXISTS reject_audit_event_mutation()")
    for table, policy in (
        ("engineering_outbox", "engineering_outbox_tenant_isolation"),
        ("consumed_approval_nonces", "consumed_nonces_tenant_isolation"),
        ("approval_intents", "approval_intents_tenant_isolation"),
        ("audit_events", "audit_events_tenant_isolation"),
        ("audit_stream_heads", "audit_stream_heads_tenant_isolation"),
    ):
        op.execute(f"DROP POLICY IF EXISTS {policy} ON {table}")
    op.drop_table("engineering_outbox")
    op.drop_table("consumed_approval_nonces")
    op.drop_table("approval_intents")
    op.drop_table("audit_events")
    op.drop_table("audit_stream_heads")
