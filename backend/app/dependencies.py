"""Application-scoped dependencies."""
from functools import lru_cache

from iq_core.kernel.iq_engine import IQEngine


@lru_cache
def get_iq_engine() -> IQEngine:
    """Return the process-local kernel instance.

    Durable storage and multi-worker coordination are deliberately deferred to Phase 4/8.
    """
    return IQEngine()
