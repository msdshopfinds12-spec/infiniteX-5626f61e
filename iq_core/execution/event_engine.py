"""In-process event publisher with correlation IDs and isolated subscribers."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Callable
from uuid import uuid4


@dataclass(frozen=True)
class ExecutionEvent:
    event_type: str
    aggregate_id: str
    correlation_id: str
    payload: dict[str, Any] = field(default_factory=dict)
    event_id: str = field(default_factory=lambda: str(uuid4()))
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


EventHandler = Callable[[ExecutionEvent], None]


class EventEngine:
    """Append-only process-local event history; subscribers are best-effort."""

    def __init__(self) -> None:
        self._events: list[ExecutionEvent] = []
        self._subscribers: dict[str, list[EventHandler]] = {}
        self._delivery_errors: list[dict[str, str]] = []
        self._lock = RLock()

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        if not event_type.strip():
            raise ValueError("Event type cannot be empty")
        if not callable(handler):
            raise TypeError("Event handler must be callable")
        with self._lock:
            self._subscribers.setdefault(event_type, []).append(handler)

    def publish(self, event: ExecutionEvent) -> ExecutionEvent:
        with self._lock:
            stored = deepcopy(event)
            self._events.append(stored)
            subscribers = tuple(self._subscribers.get(event.event_type, ()))
        for handler in subscribers:
            try:
                handler(deepcopy(stored))
            except Exception as exc:
                with self._lock:
                    self._delivery_errors.append({
                        "event_id": event.event_id,
                        "handler_error_type": exc.__class__.__name__,
                    })
        return deepcopy(stored)

    def history(self, *, aggregate_id: str | None = None) -> tuple[ExecutionEvent, ...]:
        with self._lock:
            events = self._events
            if aggregate_id is not None:
                events = [event for event in events if event.aggregate_id == aggregate_id]
            return tuple(deepcopy(event) for event in events)

    def delivery_errors(self) -> tuple[dict[str, str], ...]:
        with self._lock:
            return tuple(deepcopy(self._delivery_errors))
