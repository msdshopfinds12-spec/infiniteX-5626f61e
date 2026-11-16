from types import SimpleNamespace

import pytest

from backend.app.idempotency import (
    task_id_for_idempotency_key,
    task_record_matches_request,
)

TENANT_A = "11111111-1111-4111-8111-111111111111"
TENANT_B = "22222222-2222-4222-8222-222222222222"


def test_same_tenant_and_key_produce_same_task_id():
    assert task_id_for_idempotency_key(TENANT_A, "request-1") == (
        task_id_for_idempotency_key(TENANT_A, "request-1")
    )


def test_idempotency_key_is_tenant_scoped():
    assert task_id_for_idempotency_key(TENANT_A, "request-1") != (
        task_id_for_idempotency_key(TENANT_B, "request-1")
    )


@pytest.mark.parametrize("key", ["", " contains-space", "bad/key", "x" * 129, "☃"])
def test_invalid_idempotency_keys_are_rejected(key):
    with pytest.raises(ValueError):
        task_id_for_idempotency_key(TENANT_A, key)


def test_same_key_cannot_be_replayed_with_different_request():
    record = SimpleNamespace(
        name="research",
        objective="same objective",
        input_data={"query": "same"},
    )
    assert task_record_matches_request(
        record,
        name="research",
        objective="same objective",
        input_data={"query": "same"},
    )
    assert not task_record_matches_request(
        record,
        name="research",
        objective="different objective",
        input_data={"query": "same"},
    )
