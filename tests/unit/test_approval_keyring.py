import base64
import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.app.auth.approval_keyring import (
    ApprovalKeyringConfigurationError,
    TrustedApprovalKeyring,
    UnknownApprovalKey,
)


def public_bytes(key: Ed25519PrivateKey) -> bytes:
    return key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


def test_loads_and_resolves_multiple_trusted_key_ids():
    first = Ed25519PrivateKey.generate()
    second = Ed25519PrivateKey.generate()
    raw = json.dumps({
        "keys": {
            "2026-01": base64.b64encode(public_bytes(first)).decode("ascii"),
            "2026-02": base64.b64encode(public_bytes(second)).decode("ascii"),
        }
    })
    ring = TrustedApprovalKeyring.from_json(raw)
    assert ring.key_ids == ("2026-01", "2026-02")
    assert ring.resolve("2026-01").public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    ) == public_bytes(first)


def test_unknown_or_retired_key_id_fails_closed():
    key = Ed25519PrivateKey.generate()
    ring = TrustedApprovalKeyring({"current": public_bytes(key)})
    with pytest.raises(UnknownApprovalKey):
        ring.resolve("retired")


@pytest.mark.parametrize("raw", [
    "",
    "{}",
    '{"keys":{}}',
    '{"keys":{"bad kid":"AA=="}}',
    '{"keys":{"valid":"not-base64!"}}',
    '{"keys":{"valid":"AA=="}}',
    '{"keys":{"a":"AQ==","a":"Ag=="}}',
    '{"keys":{"a":"AQ=="},"unexpected":true}',
])
def test_rejects_invalid_or_ambiguous_key_configuration(raw):
    with pytest.raises(ApprovalKeyringConfigurationError):
        TrustedApprovalKeyring.from_json(raw)


def test_rejects_more_than_eight_keys():
    keys = {f"key-{index}": b"x" * 32 for index in range(9)}
    with pytest.raises(ApprovalKeyringConfigurationError):
        TrustedApprovalKeyring(keys)
