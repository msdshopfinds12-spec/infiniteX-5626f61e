"""Strict transport contract for a future approval-verification endpoint."""
from __future__ import annotations

import base64
import binascii
import json
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

_KEY_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_MAX_PAYLOAD_BYTES = 16_384


class ApprovalVerificationRequest(BaseModel):
    """Bounded request envelope; claims remain untrusted until verified."""

    model_config = ConfigDict(extra="forbid", strict=True)

    key_id: str = Field(min_length=1, max_length=64)
    payload: dict[str, Any]
    signature_b64: str = Field(min_length=88, max_length=88)

    @field_validator("key_id")
    @classmethod
    def validate_key_id(cls, value: str) -> str:
        if not _KEY_ID_PATTERN.fullmatch(value):
            raise ValueError("invalid approval key ID")
        return value

    @field_validator("payload")
    @classmethod
    def validate_payload_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        try:
            encoded = json.dumps(
                value, separators=(",", ":"), ensure_ascii=False, allow_nan=False
            ).encode("utf-8")
        except (TypeError, ValueError, UnicodeError) as exc:
            raise ValueError("approval payload must be finite JSON data") from exc
        if len(encoded) > _MAX_PAYLOAD_BYTES:
            raise ValueError("approval payload exceeds 16 KiB")
        return value

    @field_validator("signature_b64")
    @classmethod
    def validate_signature(cls, value: str) -> str:
        try:
            signature = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("signature must be valid Base64") from exc
        if len(signature) != 64:
            raise ValueError("Ed25519 signature must decode to exactly 64 bytes")
        return value

    def signature_bytes(self) -> bytes:
        """Return the validated 64-byte Ed25519 signature."""
        return base64.b64decode(self.signature_b64, validate=True)
