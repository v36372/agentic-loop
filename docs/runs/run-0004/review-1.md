# Review #1 — run-0004 live Herdr phase (#22 / PR #46)

## Verdict

FINDINGS

## Findings

### F1: Valid Herdr worktree state is rejected, while unverified create state is trusted (severity: major)

- `packages/operator/src/adapters/herdr-decode.ts:26-29` models `open_workspace_id` with `Schema.NullishOr(Schema.String)`, which still requires the key. Herdr's installed protocol makes that key optional and omits it for worktrees that are not currently open.
- I exercised the decoder against installed Herdr 0.7.4. `herdr worktree list --json --cwd ...` returned a normal mixed list containing closed worktrees without `open_workspace_id`; `parseWorktreeList` failed with `Missing key at ["result"]["worktrees"][1]["open_workspace_id"]`. Therefore `ensureRunWorkspace` cannot discover or create a run workspace whenever the repository has any unopened worktree in its list.
- The fixtures only use an empty list or entries where every worktree has `open_workspace_id`, so they miss the production envelope. The create fixture is also not Herdr's real shape: it uses `type: "worktree_create"` plus top-level `path`/`workspace_id`, whereas the installed schema returns `type: "worktree_created"` with `workspace` and `worktree` records.
- Conversely, `packages/operator/src/adapters/herdr-cli.ts:213-217` accepts any non-empty path/id extracted from a create response and caches it without checking that the path equals `expectedRunPath` or that Herdr lists that path/id binding. A malformed or mismatched create envelope therefore passes instead of failing closed.

**Required direction:** model optional protocol keys as optional keys, decode the real discriminated list/create envelopes (including `result.workspace.workspace_id`), require the created path to equal the requested run path, and verify the returned path/workspace binding before caching. Add exact fixtures with mixed open/closed worktrees, the actual `worktree_created` response, and mismatched create path/id failures.

### F2: Agent start/reattach can claim and follow a terminal it never proved exists (severity: major)

- `packages/operator/src/adapters/herdr-cli.ts:319-330` treats every exit-zero value with no detectable error code—including `null` or `{ result: {} }`—as a successful agent launch. The existing “starts only” fixture explicitly blesses `{ result: {} }`, so malformed start envelopes are not fail-closed.
- `packages/operator/src/adapters/herdr-decode.ts:63-70` makes `workspace_id` and `terminal_id` optional even though Herdr's `AgentInfo` protocol requires both. `findExistingAgent` only rejects a workspace mismatch when `workspace_id` happens to be present, then invents the requested workspace on the returned handle.
- Both start and reattach return `target: input.agentName` rather than the actual `terminal_id`. Herdr names are mutable/reusable targets; if the original terminal exits and its name is reused before a poll/read, this adapter can wait on and summarize a different agent. Herdr exposes terminal IDs precisely as the stable target for this case.

**Required direction:** schema-decode `agent_started` and `agent_info` success envelopes, require and verify the returned name, workspace ID, and terminal ID, and return the real terminal ID as the handle target for all waits/reads. Add malformed/missing/mismatched start/get fixtures and a name-reuse fixture proving the original terminal remains pinned.

### F3: The advertised wait timeout does not bound a Herdr call (severity: major)

- `packages/operator/src/adapters/herdr-cli.ts:368-390` checks `Date.now()` only before and after `yield* run(["agent", "get", ...])`. If that call stalls, `timeoutMs` never produces `timed_out`.
- The production runner at `packages/operator/src/adapters/herdr-cli.ts:48-69` gives `execFile` no timeout or abort signal, so an unavailable/wedged CLI can hang the accepted phase indefinitely and outlive Effect interruption. The current timeout fixture only returns immediate `working` responses and does not exercise this seam.

**Required direction:** apply the remaining deadline to each CLI invocation (with owned subprocess cancellation/kill on timeout or interruption) so `timeoutMs` bounds the whole wait. Add a fixture whose runner never resolves and assert a bounded `timed_out` result with no leaked work.

## Checks performed

- Read issue #22, PR #46, the run-0004 live-mode docs, and the prior run-0002 blocked review.
- Compared fixtures/decoders with read-only output and the JSON protocol schema from installed Herdr 0.7.4.
- `pnpm check && pnpm typecheck && pnpm test` passed (operator 58 tests; full workspace suite green).
- Memory-mode tests remain green; no live Herdr dependency was introduced into CI.
