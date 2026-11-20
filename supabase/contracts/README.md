# Database contract snapshot

This directory contains sanitized, read-only catalog evidence. Never commit application rows, credentials, connection strings, raw API keys, or secret values.

## Human approval gate

A snapshot must contain `reviewStatus: "APPROVED"` and non-empty `review.reviewedBy`, valid `review.reviewedAt`, and non-empty `review.reviewEvidence`. Captured but unreviewed evidence exits with code 2 (BLOCKED). Invalid evidence exits with code 1 (FAIL).

## Captured metadata

The snapshot includes relation identities, columns, defaults, nullability, RLS state, policy definitions, constraints, indexes, table grants, triggers, function overload identities, return types, owners, languages, volatility, SECURITY DEFINER, search_path, EXECUTE roles, function-definition hashes, and extension metadata.

The current candidate deliberately remains `PENDING_HUMAN_REVIEW`. Some table-definition fields reuse the earlier read-only catalog capture and have been cross-checked against current relation, RLS, and policy counts. Full definition-by-definition parity remains a reviewer task.

This is not a data backup, canonical bootstrap, or replayable migration baseline. Structural validity does not prove schema parity.
