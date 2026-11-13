"""Input and metadata controls for Company Brain memory."""
from typing import Any

MAX_CONTENT_CHARS = 20_000
MAX_METADATA_KEYS = 32
SENSITIVE_METADATA_KEYS = {"password", "secret", "token", "api_key", "authorization"}


def validate_memory(content: str, metadata: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    normalized = content.strip()
    if not normalized:
        raise ValueError("Memory content cannot be empty")
    if len(normalized) > MAX_CONTENT_CHARS:
        raise ValueError(f"Memory content exceeds {MAX_CONTENT_CHARS} characters")
    if len(metadata) > MAX_METADATA_KEYS:
        raise ValueError(f"Metadata cannot contain more than {MAX_METADATA_KEYS} keys")
    blocked = SENSITIVE_METADATA_KEYS.intersection(k.lower() for k in metadata)
    if blocked:
        raise ValueError("Sensitive credential-like metadata keys are not allowed")
    return normalized, metadata
