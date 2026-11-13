from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from database.models import Base
from database.repositories.task_repository import TaskRepository


def make_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)()


def test_repository_persists_task_record():
    session = make_session()
    repo = TaskRepository(session, "11111111-1111-4111-8111-111111111111")
    task = repo.create(task_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                       name="research", objective="Persistence test",
                       input_data={"topic": "database"})
    loaded = repo.get(task.task_id)
    assert loaded is not None and loaded.status == "PENDING"
    assert loaded.input_data == {"topic": "database"}
    session.close()


def test_tenant_scope_hides_other_tenant_records():
    session = make_session()
    owner = TaskRepository(session, "11111111-1111-4111-8111-111111111111")
    other = TaskRepository(session, "22222222-2222-4222-8222-222222222222")
    owner.create(task_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                 name="private", objective="Tenant scoped", input_data={})
    assert other.get("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb") is None
    session.close()


def test_task_claim_is_atomic_and_single_use():
    session = make_session()
    repo = TaskRepository(session, "11111111-1111-4111-8111-111111111111")
    task_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    repo.create(task_id=task_id, name="research", objective="Claim test", input_data={})
    assert repo.claim_for_execution(task_id)
    assert not repo.claim_for_execution(task_id)
    assert repo.get(task_id).status == "RUNNING"
    session.close()
