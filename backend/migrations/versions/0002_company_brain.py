"""Add tenant-scoped Company Brain memory and knowledge graph tables."""
from alembic import op
import sqlalchemy as sa

revision = "0002_company_brain"
down_revision = "0001_task_records"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "memory_records",
        sa.Column("memory_id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("embedding", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_memory_tenant_created", "memory_records", ["tenant_id", "created_at"])
    op.create_table(
        "knowledge_edges",
        sa.Column("edge_id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), nullable=False),
        sa.Column("source", sa.String(500), nullable=False),
        sa.Column("relation", sa.String(100), nullable=False),
        sa.Column("target", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_knowledge_tenant_source", "knowledge_edges", ["tenant_id", "source"])
    op.create_index("ix_knowledge_tenant_target", "knowledge_edges", ["tenant_id", "target"])
    op.execute("ALTER TABLE memory_records ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE memory_records FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY memory_records_tenant_isolation ON memory_records
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    """)
    op.execute("ALTER TABLE knowledge_edges ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE knowledge_edges FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY knowledge_edges_tenant_isolation ON knowledge_edges
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS knowledge_edges_tenant_isolation ON knowledge_edges")
    op.execute("DROP POLICY IF EXISTS memory_records_tenant_isolation ON memory_records")
    op.drop_index("ix_knowledge_tenant_target", table_name="knowledge_edges")
    op.drop_index("ix_knowledge_tenant_source", table_name="knowledge_edges")
    op.drop_table("knowledge_edges")
    op.drop_index("ix_memory_tenant_created", table_name="memory_records")
    op.drop_table("memory_records")
