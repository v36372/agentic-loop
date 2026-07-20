# Review #2 — run-0002 operator phase bridge (#8)

## Verdict

FINDINGS

## Findings

### F1: Live agent find-or-start is still non-atomic on concurrent retries (severity: major)

- evidence: `packages/operator/src/adapters/herdr-cli.ts` implements `startPiPhase` as `agent get <name>` followed by a separate `agent start <name>` when absent. Two overlapping `runPhase` calls can both observe `agent_not_found` before either start completes. Unlike worktree creation, an `agent start` conflict is not followed by a re-query/reattach. The new “in-flight” phase test calls the in-memory adapter twice sequentially, and the CLI test supplies an already-existing agent; neither test overlaps two missing-agent starts.
- why it matters: under the duplicate-request/retry race AC2 is intended to make harmless, the result is either two `pi` panes with the same logical phase identity or one background run failing on a name conflict. The implementation has not established atomic find-or-start behavior, and the tests still avoid the contested seam.
- required fix: coalesce/lock starts by workspace and run/phase/attempt in the operator, or make start-conflict recovery re-query Herdr and attach to the winner. Add a genuinely concurrent test that holds both lookups at “not found,” releases both starts, and proves exactly one launch plus two waiters.

### F2: Control still fails open into fake mode and loses accepted jobs after background failure (severity: major)

- evidence: `parseControlPhaseMode(undefined)` still selects `memory`, and the new test explicitly blesses that behavior. Thus launching control without production configuration accepts jobs using in-memory Herdr/sender rather than refusing to start. Live mode now correctly requires a valid HTTP(S) sink, but after a 202 any `runPhase`/completion POST failure is attempted only once and stored in an unbounded process-local array. The code calls this ledger “durable,” although it disappears on restart; `/healthz` continues to return `ok: true`, and no test exercises the failure path or retry.
- why it matters: an omitted mode still produces an apparently working operator that never launches live Herdr, and a transient sink failure permanently loses the completion after the caller has been told the phase was accepted. The partial configuration checks do not satisfy the fail-closed/supervised behavior required by prior F5 or reliably satisfy AC4.
- required fix: require an explicit mode (or default the deployable entrypoint to live), reserve memory mode for an explicit dev/test command, and supervise accepted background work with retry/durable state or an observable failed health/job state. Test a sender failure through the HTTP route and its retry/failure reporting behavior.

### F3: `run_id` remains a filesystem path traversal input (severity: major)

- evidence: `IdentityString` was changed to `Schema.NonEmptyString`, but `run_id` is interpolated directly by `expectedRunPath` as `${repoCheckout}-runs/${runId}` and into the branch/agent name. Values such as `../../other-checkout`, `/absolute`, or whitespace pass the request schema. The comment claiming a “trimmed identity string” is also false: `NonEmptyString` does not trim or reject whitespace-only values. New schema tests cover only `""`.
- why it matters: the HTTP boundary can direct Herdr worktree creation outside the run directory and can create malformed/colliding branch and agent identities. Prior F6 was only partially fixed; because the identity now crosses a filesystem boundary, this is more than a cosmetic validation gap.
- required fix: give `run_id` a bounded safe-token schema (for example, an anchored alphanumeric/`._-` pattern that rejects `.`/`..`, separators, control characters, and surrounding whitespace) and test traversal, absolute-path, whitespace-only, and overlong inputs. Apply suitable bounded refinements to other correlation IDs as well.

### F4: The control application has no runnable built entrypoint (severity: major)

- evidence: after a successful `tsc -b`, running `node apps/control/dist/index.js` fails before startup because `@agentic-loop/operator` exports `./src/index.ts`, which then imports source-side `.js` files that do not exist. Independently, `isEntrypoint()` only recognizes `/apps/control/src/index.ts` and `/apps/control/src/index.js`, not `/apps/control/dist/index.js`. `apps/control/package.json` provides no start/dev script or bin that supplies a working TypeScript loader.
- why it matters: the HTTP bridge passes Vitest because Vite resolves the source graph, but the produced app cannot actually be launched as a Node service. That leaves AC1 without an operational entrypoint despite green build/tests.
- required fix: define and test a supported launch path: publish/resolve workspace package exports to built JS (or provide an explicit TypeScript runner), add a control start script/bin, and recognize that entrypoint. Add a smoke test that starts the real packaged command and reaches `/healthz`.

### F5: Completion recovery remains process-local before transport (severity: minor)

- evidence: the corrected HTTP sender uses Inngest's top-level `id`, but `findByIdempotencyKey` still reads only its process-local `seen` map. After restart, a completed phase whose Herdr agent is no longer discoverable can run `pi` again before Inngest deduplicates the repeated event.
- why it matters: downstream duplicate completion effects are now harmless, but phase work itself can be repeated after a specific restart/cleanup sequence.
- required fix: recover completion/agent terminal state from a durable source, or retain a durable phase ledger/outbox keyed by run/phase/attempt. This is a residual recovery limitation rather than a transport-contract failure.

## Non-findings / checked OK

- Prior F1's workspace issue is fixed: live reattachment joins `workspace list` with `worktree list`, obtains the real path/open workspace ID, fails on malformed/list errors, re-queries after create conflicts, and no longer fabricates IDs or falls back to a normal workspace. Fixtures match the installed Herdr worktree envelope.
- Prior F3's decoding issue is fixed: actual `result.agent.agent_status` and `result.read.text` shapes are schema-decoded, malformed envelopes fail closed, and polling observes blocked/done/idle/unknown rather than waiting only for idle.
- Prior F4's transport contract is fixed: the sender posts an Inngest-compatible `{ name, id, data }` envelope with `id === idempotency_key`; fake-fetch tests assert the exact request, non-2xx behavior, and process-local duplicate suppression.
- Completion fields remain complete against the internal catalog, and the completion schema now rejects a key inconsistent with run/phase/attempt/status.
- Live mode rejects missing, malformed, and non-HTTP(S) completion URLs; unknown explicit mode strings are rejected.
- Operator/control boundaries remain intact, and I found no new Effect service/layer misuse.
- Independently ran lint, format check, root typecheck, and the full recursive suite successfully. Operator has 39 passing tests and control has 10.
- Vendor/skill trees remain excluded from pnpm workspace discovery, TypeScript references, lint, and formatting; no new CI break was found there.

## Notes for orchestrator

- Rework substantially repaired workspace discovery, Herdr envelope parsing, Inngest transport, and schema key consistency.
- Do not accept the sequential fake tests as proof of duplicate-start safety; F1 needs a contested concurrent test.
- The packaged-entrypoint smoke failure is outside current Vitest coverage and should be added to the acceptance gate.
