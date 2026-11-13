"""Deterministic bounded exponential retry policy."""

from datetime import datetime, timedelta


class RetryManager:
    def __init__(
        self,
        *,
        max_attempts: int = 3,
        base_delay_seconds: float = 1.0,
        max_delay_seconds: float = 60.0,
    ) -> None:
        if max_attempts < 1:
            raise ValueError("max_attempts must be at least 1")
        if base_delay_seconds < 0 or max_delay_seconds < 0:
            raise ValueError("Retry delays cannot be negative")
        if max_delay_seconds < base_delay_seconds:
            raise ValueError("max_delay_seconds cannot be less than base_delay_seconds")
        self.max_attempts = max_attempts
        self.base_delay_seconds = base_delay_seconds
        self.max_delay_seconds = max_delay_seconds

    def next_retry_at(self, *, attempt: int, now: datetime) -> datetime | None:
        if attempt < 1:
            raise ValueError("attempt must be at least 1")
        if now.tzinfo is None:
            raise ValueError("now must be timezone-aware")
        if attempt >= self.max_attempts:
            return None
        delay = min(
            self.base_delay_seconds * (2 ** (attempt - 1)),
            self.max_delay_seconds,
        )
        return now + timedelta(seconds=delay)
