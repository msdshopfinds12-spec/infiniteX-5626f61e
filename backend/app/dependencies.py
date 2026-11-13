from functools import lru_cache
from iq_core.kernel.iq_engine import IQEngine


@lru_cache
def get_iq_engine() -> IQEngine:
    return IQEngine()
