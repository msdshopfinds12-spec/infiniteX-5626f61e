"""Validated process-local registry for explicitly declared capabilities."""

from __future__ import annotations
from dataclasses import dataclass
from enum import Enum
from threading import RLock
from typing import Any, Callable


class CapabilityRisk(str, Enum):
    READ_ONLY = "READ_ONLY"
    WRITE = "WRITE"
    DESTRUCTIVE = "DESTRUCTIVE"


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    risk: CapabilityRisk
    handler: Callable[[dict[str, Any]], Any]
    input_validator: Callable[[dict[str, Any]], dict[str, Any]] | None = None
    version: str = "1"


class ToolRegistry:
    """In-memory registry; registration does not grant permission to invoke."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}
        self._lock = RLock()

    @staticmethod
    def validate(definition: ToolDefinition) -> None:
        if not definition.name.strip():
            raise ValueError("Tool name cannot be empty")
        if not definition.description.strip():
            raise ValueError("Tool description cannot be empty")
        if not definition.version.strip():
            raise ValueError("Tool version cannot be empty")
        if not isinstance(definition.risk, CapabilityRisk):
            raise ValueError("Tool risk must be a supported CapabilityRisk")
        if not callable(definition.handler):
            raise TypeError("Tool handler must be callable")
        if definition.input_validator is not None and not callable(definition.input_validator):
            raise TypeError("Tool input validator must be callable")

    def register(self, definition: ToolDefinition) -> None:
        self.validate(definition)
        with self._lock:
            if definition.name in self._tools:
                raise ValueError(f"Tool already registered: {definition.name}")
            self._tools[definition.name] = definition

    def get(self, name: str) -> ToolDefinition | None:
        with self._lock:
            return self._tools.get(name)

    def list_tools(self) -> tuple[ToolDefinition, ...]:
        with self._lock:
            return tuple(self._tools.values())
