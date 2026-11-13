"""Hybrid lexical and cosine similarity ranking."""
import math
import re
from collections.abc import Sequence


def lexical_score(query: str, content: str) -> float:
    terms = {term for term in re.findall(r"[a-zA-Z0-9_]+", query.lower()) if len(term) > 1}
    if not terms:
        return 0.0
    words = set(re.findall(r"[a-zA-Z0-9_]+", content.lower()))
    return len(terms & words) / len(terms)


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    if not left or len(left) != len(right):
        return 0.0
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


def hybrid_score(query: str, content: str, query_vector: Sequence[float] | None,
                 stored_vector: Sequence[float] | None) -> float:
    lexical = lexical_score(query, content)
    if query_vector is None or stored_vector is None:
        return lexical
    return 0.35 * lexical + 0.65 * max(0.0, cosine_similarity(query_vector, stored_vector))
