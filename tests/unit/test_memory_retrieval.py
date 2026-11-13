from iq_core.memory.retrieval import cosine_similarity, hybrid_score, lexical_score


def test_lexical_score_ranks_matching_content():
    assert lexical_score("project roadmap", "project roadmap complete") > lexical_score(
        "project roadmap", "unrelated content")


def test_cosine_similarity_handles_equal_and_zero_vectors():
    assert cosine_similarity([1, 0], [1, 0]) == 1
    assert cosine_similarity([0, 0], [1, 0]) == 0
    assert cosine_similarity([1], [1, 2]) == 0


def test_hybrid_uses_vector_when_available():
    lexical = lexical_score("memory search", "memory found")
    score = hybrid_score("memory search", "memory found", [1, 0], [1, 0])
    assert score > lexical
