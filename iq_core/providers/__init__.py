"""First-party provider runtime primitives for InfiniteX.

No network model adapter is enabled by default. Local deterministic utilities
are separate from generative inference and must not be represented as an LLM.
"""
from iq_core.providers.contracts import InferenceRequest, InferenceResult
from iq_core.providers.runtime import ProviderDenied, ProviderRuntime, build_mock_runtime

__all__ = [
    "InferenceRequest",
    "InferenceResult",
    "ProviderDenied",
    "ProviderRuntime",
    "build_mock_runtime",
]
