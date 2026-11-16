"""Immutable trusted Ed25519 public-key ring for approval verification."""
from __future__ import annotations

import base64
import binascii
import json
import re
from types import MappingProxyType
from typing import Mapping

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

_KID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_MAX_KEYS = 8


class ApprovalKeyringConfigurationError(ValueError):
    """Trusted public-key configuration is invalid."""


class UnknownApprovalKey(LookupError):
    """Token references an untrusted or retired key ID."""


def _reject_duplicate_pairs(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ApprovalKeyringConfigurationError("duplicate JSON key")
        result[key] = value
    return result


class TrustedApprovalKeyring:
    """Read-only key-ID registry; rotation is additive then retire-by-removal."""

    def __init__(self, keys: Mapping[str, bytes]) -> None:
        if not isinstance(keys, Mapping) or not 1 <= len(keys) <= _MAX_KEYS:
            raise ApprovalKeyringConfigurationError("key ring must contain 1 to 8 keys")
        parsed: dict[str, Ed25519PublicKey] = {}
        for key_id, raw_key in keys.items():
            if not isinstance(key_id, str) or not _KID_PATTERN.fullmatch(key_id):
                raise ApprovalKeyringConfigurationError("invalid key ID")
            if not isinstance(raw_key, bytes) or len(raw_key) != 32:
                raise ApprovalKeyringConfigurationError("Ed25519 public keys must be 32 bytes")
            if key_id in parsed:
                raise ApprovalKeyringConfigurationError("duplicate key ID")
            parsed[key_id] = Ed25519PublicKey.from_public_bytes(raw_key)
        self._keys = MappingProxyType(parsed)

    @classmethod
    def from_json(cls, raw: str) -> "TrustedApprovalKeyring":
        """Load JSON shaped as a single keys object containing Base64 public keys."""
        if not isinstance(raw, str) or not raw.strip() or len(raw) > 8192:
            raise ApprovalKeyringConfigurationError("public-key configuration is missing or oversized")
        try:
            document = json.loads(raw, object_pairs_hook=_reject_duplicate_pairs)
        except (json.JSONDecodeError, TypeError) as exc:
            raise ApprovalKeyringConfigurationError("public-key configuration is invalid JSON") from exc
        if not isinstance(document, dict) or set(document) != {"keys"}:
            raise ApprovalKeyringConfigurationError("configuration must contain only a keys object")
        encoded_keys = document["keys"]
        if not isinstance(encoded_keys, dict) or not 1 <= len(encoded_keys) <= _MAX_KEYS:
            raise ApprovalKeyringConfigurationError("keys must contain 1 to 8 entries")

        decoded: dict[str, bytes] = {}
        for key_id, encoded in encoded_keys.items():
            if not isinstance(key_id, str) or not _KID_PATTERN.fullmatch(key_id):
                raise ApprovalKeyringConfigurationError("invalid key ID")
            if not isinstance(encoded, str):
                raise ApprovalKeyringConfigurationError("public key must be Base64 text")
            try:
                decoded[key_id] = base64.b64decode(encoded, validate=True)
            except (binascii.Error, ValueError) as exc:
                raise ApprovalKeyringConfigurationError("public key is not valid Base64") from exc
        return cls(decoded)

    def resolve(self, key_id: str) -> Ed25519PublicKey:
        """Resolve only explicitly configured key IDs; unknown IDs fail closed."""
        if not isinstance(key_id, str):
            raise UnknownApprovalKey("unknown approval key ID")
        key = self._keys.get(key_id)
        if key is None:
            raise UnknownApprovalKey("unknown approval key ID")
        return key

    @property
    def key_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._keys))
