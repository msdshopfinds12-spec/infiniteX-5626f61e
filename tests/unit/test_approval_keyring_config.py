import base64
import json

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.app.auth.approval_keyring import ApprovalKeyringConfigurationError
from backend.app.auth.approval_keyring_config import load_approval_keyring
from backend.app.config import Settings


def test_loads_public_keys_from_server_settings():
    key = Ed25519PrivateKey.generate().public_key().public_bytes_raw()
    raw = json.dumps({"keys": {"active-2026": base64.b64encode(key).decode("ascii")}})
    settings = Settings(approval_public_keys_json=raw)

    ring = load_approval_keyring(settings)

    assert ring.key_ids == ("active-2026",)


def test_missing_public_key_configuration_fails_closed():
    settings = Settings(approval_public_keys_json=None)

    with pytest.raises(ApprovalKeyringConfigurationError, match="not configured"):
        load_approval_keyring(settings)


def test_malformed_public_key_configuration_fails_closed():
    settings = Settings(approval_public_keys_json='{"keys":{"active":"bad"}}')

    with pytest.raises(ApprovalKeyringConfigurationError):
        load_approval_keyring(settings)
