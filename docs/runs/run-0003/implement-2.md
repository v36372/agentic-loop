# IMPLEMENT-2 — run-0003 rework for review #1

Addresses `docs/runs/run-0003/review-1.md` findings on PR #45.

## F1 — `RepoRef` too loose

- Added bounded `RepoOwner` / `RepoName` segment schemas.
- Replaced `RepoRef` with a composed owner/name pattern that rejects:
  - traversal-like segments (`../repo`, `./repo`, `owner/..`, `owner/.`)
  - leading/trailing separators (`-owner/repo`, `owner/-repo`, trailing `-`/`.`)
  - extra/missing segments, whitespace, overlong values
- Schema + HTTP rejection tests cover the unsafe cases; valid GitHub-style refs still accept.

## F2 — conflicting identity reuse on same `run_id`

- `EnsureRunWorkspaceInput` / `HerdrWorkspace` now carry immutable `ticketId`, `projectId`, `repo`, optional `kind`.
- Memory `ensureRunWorkspace` binds identity on first accept and rejects conflicts (ticket/project/repo/kind **or** path) via `RunIdentityConflictError` **before** 202.
- Prior-completion short-circuit in `runPhase` verifies full immutable identity, not just run/phase/attempt/status.
- Control maps identity conflicts to `409 run_identity_conflict`.
- Tests:
  - operator: conflicting ensure rejected; same-identity retry harmless; prior-completion conflict rejected
  - control: conflicting reuse → 409; same-identity retry → 202 + single completion

## F3 — unbounded HTTP body

- `readJsonBody` enforces `MAX_START_PHASE_BODY_BYTES` (64 KiB):
  - early reject when `Content-Length` exceeds the limit
  - stream-time reject when accumulated chunks exceed the limit
- Returns `413 payload_too_large` with `max_bytes`.
- Tests for declared and chunked oversized bodies.

## Out of scope (unchanged)

- Live Herdr / live HTTP completion / durable outbox
- Silent memory default remains forbidden
