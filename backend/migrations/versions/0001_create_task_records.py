"""Create persistent task records and PostgreSQL tenant RLS."""
from alembic import op
import sqlalchemy as sa

revision = "0001_task_records"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_records",
        sa.Column("task_id", sa.String(36), primary_key=True),
        sa.Column("tenant_id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("objective", sa.Text(), nullable=False),
        sa.Column("input_data", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("error_type", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_task_records_tenant_created", "task_records",
                    ["tenant_id", "created_at"])
    op.create_index("ix_task_records_tenant_status", "task_records",
                    ["tenant_id", "status"])
    op.execute("ALTER TABLE task_records ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE task_records FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY task_records_tenant_isolation ON task_records
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS task_records_tenant_isolation ON task_records")
    op.drop_index("ix_task_records_tenant_status", table_name="task_records")
    op.drop_index("ix_task_records_tenant_created", table_name="task_records")
    op.drop_table("task_records")
