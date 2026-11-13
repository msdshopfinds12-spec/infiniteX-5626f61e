"""Embedding provider contracts. No external provider is enabled by default."""
from collections.abc import Sequence
from typing import Protocol


class EmbeddingProvider(Protocol):
    @property
    def dimensions(self) -> int: ...
    def embed(self, text: str) -> Sequence[float]: ...


class EmbeddingUnavailableError(RuntimeError):
    pass


class UnconfiguredEmbeddingProvider:
    @property
    def dimensions(self) -> int:
        raise EmbeddingUnavailableError("No embedding provider is configured")

    def embed(self, text: str) -> Sequence[float]:
        raise EmbeddingUnavailableError("No embedding provider is configured")
