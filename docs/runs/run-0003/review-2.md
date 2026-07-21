# Review #2 — run-0003 start-phase memory unit (#21)

## Verdict

FINDINGS

## Prior finding verification

- **F1 is only partially fixed:** the prior malformed/traversal-like values are now rejected at both schema and HTTP seams, and the new tests would have failed before the rework. However, the replacement schema introduces the regression below.
- **F2 is fixed:** memory workspace acceptance binds run/ticket/project/repo/kind plus expected path; conflicting reuse returns `409` before `202`; prior-completion identity is checked; same-identity retries remain harmless. The new operator and HTTP tests exercise behavior that failed before.
- **F3 is fixed:** declared and streamed request bodies are capped at 64 KiB and return `413`; both new tests would have failed before.

## Findings

### F1: The hardened repository schema rejects valid GitHub repositories (severity: minor)

- **What is wrong:** `packages/operator/src/schema.ts` requires the repository-name segment to start and end with an alphanumeric character. The tests explicitly classify `owner/.hidden`, `owner/_repo`, `owner/-repo`, `owner/repo-`, and `owner/repo.` as malformed. GitHub's documented repository-name contract allows ASCII letters, digits, `.`, `-`, and `_` with a 100-character maximum; it does not impose this alphanumeric-edge rule. This is not hypothetical: public repositories such as `github/.github` and `actions/.github` exist, but `RepoRef` rejects them.
- **Why it matters:** The rework fixed unsafe path segments by narrowing the entire GitHub repository namespace too far. A valid ticket for a repository such as `github/.github` now fails `POST /v1/phases/start` with `400`, so the API cannot accept a legitimate repository identity.
- **Concrete fix direction:** Keep the owner constraints, slash count, whitespace rejection, segment length bound, and explicit rejection of bare `.`/`..`, but allow GitHub-valid punctuation at repository-name edges. Derive `RepoRef` from the same segment contract rather than duplicating a stricter regex. Replace the tests that enshrine false invalid cases with positive coverage for at least `.github` and boundary punctuation plus negative coverage for bare `.`/`..`, separators, whitespace, extra segments, and overlength.

## Acceptance and verification

- The remaining issue #21 acceptance criteria are met: explicit memory selection, runnable package start plus `/healthz` smoke, parsed start request, safe bounded `run_id`, acceptance-before-`202`, one schema-valid memory completion, harmless duplicate recording, and bounded visible background-failure diagnostics.
- `pnpm check` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — passed (35 operator tests and 20 control tests, plus all other workspace tests).
- PR CI is green.

The valid-repository regression must be corrected before merge.
