"""Small first-party deterministic classifier; not a generative AI model."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RuleClassification:
    category: str
    matched_terms: tuple[str, ...]
    engine: str = "infinite-local-rules-v1"
    generative: bool = False


_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("engineering", ("code", "bug", "build", "test", "api", "database", "security")),
    ("research", ("research", "compare", "source", "evidence", "audit", "analyze")),
    ("support", ("help", "issue", "error", "account", "support", "problem")),
    ("content", ("write", "draft", "caption", "design", "content", "social")),
)


class LocalRulesEngine:
    """Deterministic keyword routing with transparent, inspectable behavior."""

    def classify(self, text: str) -> RuleClassification:
        if not isinstance(text, str) or not text.strip():
            raise ValueError("text is required")
        normalized = text.casefold()
        scores = [
            (sum(term in normalized for term in terms), category, terms)
            for category, terms in _RULES
        ]
        score, category, terms = max(scores, key=lambda item: item[0])
        if score == 0:
            return RuleClassification(category="unknown", matched_terms=())
        matched = tuple(term for term in terms if term in normalized)
        return RuleClassification(category=category, matched_terms=matched)
