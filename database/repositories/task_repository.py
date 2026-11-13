from datetime import datetime, timezone
from typing import Any
from sqlalchemy import select, text, update
from sqlalchemy.orm import Session
from database.models.task import TaskRecord


class TaskRepository:
    def __init__(self, session: Session, tenant_id: str) -> None:
        self.session = session
        self.tenant_id = tenant_id

    def _set_database_tenant(self) -> None:
        if self.session.get_bind().dialect.name == "postgresql":
            self.session.execute(
                text("SELECT set_config('app.tenant_id', :tenant_id, true)"),
                {"tenant_id": self.tenant_id},
            )

    def create(self, *, task_id: str, name: str, objective: str,
               input_data: dict[str, Any]) -> TaskRecord:
        self._set_database_tenant()
        record = TaskRecord(task_id=task_id, tenant_id=self.tenant_id, name=name,
                            objective=objective, input_data=input_data, status="PENDING")
        self.session.add(record)
        self.session.commit()
        self.session.refresh(record)
        return record

    def get(self, task_id: str) -> TaskRecord | None:
        self._set_database_tenant()
        return self.session.scalar(select(TaskRecord).where(
            TaskRecord.task_id == task_id, TaskRecord.tenant_id == self.tenant_id
        ))

    def claim_for_execution(self, task_id: str) -> bool:
        self._set_database_tenant()
        result = self.session.execute(
            update(TaskRecord)
            .where(TaskRecord.task_id == task_id,
                   TaskRecord.tenant_id == self.tenant_id,
                   TaskRecord.status == "PENDING")
            .values(status="RUNNING", started_at=datetime.now(timezone.utc),
                    attempts=TaskRecord.attempts + 1)
        )
        self.session.commit()
        return result.rowcount == 1

    def finish(self, task_id: str, *, status: str, result: Any = None,
               error: str | None = None, error_type: str | None = None,
               finished_at: datetime | None = None) -> TaskRecord | None:
        self._set_database_tenant()
        record = self.get(task_id)
        if record is None:
            return None
        record.status = status
        record.result = result
        record.error = error
        record.error_type = error_type
        record.finished_at = finished_at or datetime.now(timezone.utc)
        self.session.commit()
        self.session.refresh(record)
        return record
