# IMPLEMENT-3 — run-0003 rework for review #2

Addresses `docs/runs/run-0003/review-2.md` only.

## F1 — `RepoName` over-restrictive

- Repository name now matches GitHub: `[A-Za-z0-9._-]{1,100}` with explicit rejection of bare `.` / `..`.
- Edge punctuation is allowed (`.github`, `_repo`, `-repo`, trailing `-`/`.`).
- Owner constraints unchanged (alphanumeric edges, hyphens inside, max 39).
- `RepoRef` validates via the **same** owner/name segment contracts (split + shared patterns), not a stricter duplicated regex.
- Positive tests: `github/.github`, boundary punctuation names.
- Negative tests: bare `.`/`..`, separators, whitespace, extra segments, overlength.

## Unchanged (prior fixes)

- F2 identity binding / conflict rejection preserved.
- F3 64 KiB body limit preserved.
