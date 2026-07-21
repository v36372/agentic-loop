# Review #1 — run-0003 start-phase memory unit (#21)

## Verdict

FINDINGS

## Findings

### F1: `RepoRef` accepts traversal-like and otherwise malformed repository identities (severity: major)

- **What is wrong:** `packages/operator/src/schema.ts` defines `RepoRef` as `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`. That accepts values including `../repo`, `./repo`, `owner/..`, `owner/.`, `-owner/repo`, and `owner/-repo`. The only repository rejection test covers a missing owner (`agentic-loop`), so it does not exercise the unsafe segment cases. I confirmed these values decode successfully.
- **Why it matters:** Acceptance criterion 3 explicitly requires malformed repository values to be rejected. These are not valid GitHub-style `owner/name` identities, yet the HTTP boundary accepts them and passes them into the operator/Herdr port as trusted repository identity.
- **Concrete fix direction:** Define bounded owner and repository segment schemas with their actual allowed forms, explicitly excluding `.`/`..` and invalid leading/trailing characters, compose them into `RepoRef`, and add schema plus HTTP-route rejection tests for traversal-like segments, extra/missing segments, whitespace, and overlong values.

### F2: Reusing a `run_id` with different ticket identity is accepted and can suppress the new completion (severity: major)

- **What is wrong:** `packages/operator/src/adapters/herdr-memory.ts` returns any workspace already stored under `runId` without checking its repository or expected checkout path. Separately, `packages/operator/src/phase.ts#findPriorCompletion` looks up only `run_id + phase + attempt + status` and returns the prior event without checking `ticket_id`, `project_id`, `repo`, or `kind`. Thus a second request using the same run/phase/attempt but a different ticket identity receives `202`, attaches to the first workspace, and can short-circuit to the first ticket's completion without recording a completion for the newly accepted request.
- **Why it matters:** `run_id` is the key for workspace reattachment and event correlation. Accepting conflicting immutable identity silently misattributes work and leaves the second workflow waiting for a completion matching its own ticket. This makes the accepted state invalid and undermines the harmless-retry/idempotency claim.
- **Concrete fix direction:** Bind each memory run to immutable ticket/project/repository identity at first acceptance and reject conflicting reuse before returning `202`. Also verify an existing workspace's repository/path and verify any prior completion matches the request's immutable identity before short-circuiting. Add an HTTP-level conflicting-identity test and an operator test proving legitimate same-identity retries remain harmless.

### F3: The HTTP request body is unbounded (severity: minor)

- **What is wrong:** `apps/control/src/http.ts#readJsonBody` collects every incoming chunk and concatenates the entire body with no byte limit or `Content-Length` guard. `run_id` itself is bounded, but an arbitrarily large JSON body or context string is buffered before schema decoding.
- **Why it matters:** A local client can exhaust the control process's memory and take down `/healthz` and all accepted background work. Boundary validation happens too late to provide a bound.
- **Concrete fix direction:** Enforce a small explicit maximum while streaming the body (with an early `Content-Length` check where present), return `413` for oversized requests, and test both declared and chunked oversized bodies.

## Verification

- Read issue #21, issue #8, PR #45, the exact blocked PR #19 review, and `docs/runs/run-0003/implement.md`.
- Loaded the coding-standards and Effect skills and reviewed the production seams and tests.
- `pnpm check` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — passed (all workspace tests, including the packaged start smoke test).

The explicit memory-mode selection, safe bounded `run_id`, runnable package entrypoint, bounded failure ledger, visible degraded diagnostics, and basic memory happy path are present, but the findings above prevent merge.
