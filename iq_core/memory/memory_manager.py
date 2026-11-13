"""Small application-facing facade for Company Brain."""
from iq_core.memory.company_brain import CompanyBrain, MemoryInput


class MemoryManager:
    def __init__(self, brain: CompanyBrain) -> None:
        self.brain = brain

    def add(self, content: str, *, source: str = "user", metadata=None):
        return self.brain.remember(MemoryInput(content=content, source=source,
                                               metadata=metadata or {}))

    def find(self, query: str, limit: int = 10):
        return self.brain.search(query, limit)
