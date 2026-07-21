# run-0004 implement-2 — rework for review #1

Issue: [#22](https://github.com/v36372/agentic-loop/issues/22)  
PR: [#46](https://github.com/v36372/agentic-loop/pull/46)  
Review: `docs/runs/run-0004/review-1.md`

## F1 — worktree decode / create trust

- Modeled `open_workspace_id` as `Schema.optionalKey` so closed worktrees without the key decode (Herdr 0.7.4 omits the key).
- Decode real `type: "worktree_created"` envelopes with nested `workspace.workspace_id` + `worktree.path` (and optional `worktree.open_workspace_id` consistency check).
- Reject invented `worktree_create` top-level shapes.
- Require create path === `expectedRunPath`.
- Re-list after create and require the path/workspace binding before caching; mismatched create path/id fails closed.
- Fixtures: mixed open/closed worktree list, real create envelope, path mismatch, unconfirmed binding.

## F2 — start/reattach proves agent exists

- Schema-decode `agent_started` and `agent_info` with required `terminal_id` + `workspace_id`.
- Prefer Herdr `name` field for agentName (detected kind stays in `agent`).
- Handle `target` is always the real `terminal_id` for wait/read.
- Empty/malformed start envelopes (`{ result: {} }`) fail closed.
- Workspace mismatch fails closed (no invent-on-missing).
- Fixtures: malformed/missing/mismatched start/get; name-reuse pins original terminal for subsequent wait/read.

## F3 — wait timeout bounds CLI

- `run(args, { timeoutMs })` carries remaining deadline into each invocation.
- `makeAbortableRun` owns AbortController: deadline abort → `HerdrCliTimeoutError`; Effect interrupt aborts owned work.
- Production `execFile` uses signal + SIGKILL on abort.
- Wait maps CLI timeout errors to agent status `timed_out`.
- Fixture: runner that never resolves → bounded `timed_out` and every launch cancelled.

## Out of scope (unchanged)

- HTTP/Inngest completion delivery (#23)
- Durable process-restart outbox
- Cross-process locks beyond start-conflict re-query

## Verification

- `pnpm check && pnpm typecheck && pnpm test` (local)
- Operator CLI fixtures only — no live Herdr in CI
