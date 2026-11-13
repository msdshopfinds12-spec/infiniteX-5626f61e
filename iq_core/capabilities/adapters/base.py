"""Minimal provider adapter contract with explicit unconfigured status."""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ProviderStatus:
    provider_name: str
    configured: bool
    status: str
    detail: str


class ProviderAdapter(ABC):
    name: str

    @abstractmethod
    def status(self) -> ProviderStatus:
        """Report provider readiness without exposing credentials."""

    @abstractmethod
    def execute(self, operation: str, payload: dict[str, Any]) -> Any:
        """Execute a provider operation only after explicit configuration."""
