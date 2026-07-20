# Review #1 — run-0002 operator phase bridge (#8)

## Verdict

FINDINGS

## Findings

### F1: Live workspace reattachment is neither safe nor usable (severity: major)

- evidence: `packages/operator/src/adapters/herdr-cli.ts` converts a matching `workspace list` entry into a `HerdrWorkspace` with `path: ""`; the installed CLI's list/get responses expose the label and workspace ID but no cwd. `runPhase` then passes that empty path to `agent start --cwd`. The same adapter suppresses every `workspace list` error and treats it as “not found,” and suppresses every `worktree create` error by creating a normal workspace at `repoCheckout` while still returning the predicted worktree path. It can even fabricate `ws-${runId}` when response parsing fails. `findWorkspaceByRunId` only consults the process-local cache and does not query Herdr.
- why it matters: a retry after process restart cannot correctly reattach to the checkout. A transient list failure or worktree-create race can blindly create another workspace, and the fallback can associate a workspace rooted at one directory with a returned path in another. This violates AC2 and can launch the phase in the wrong checkout.
- required fix: resolve and validate the actual checkout and workspace ID from Herdr state (or a validated deterministic path), make inability to list/parse state fail closed, and handle create conflicts by re-querying the run identity rather than creating a different workspace. Never synthesize live IDs or paths.

### F2: In-flight retries blindly start another live `pi` agent (severity: major)

- evidence: `runPhase` only short-circuits after a completion exists. Before completion, `makeHerdrCli().startPiPhase` unconditionally executes `herdr agent start`; it never lists or reattaches to the `${runId}-${phase}-${attempt}` agent. By contrast, `makeInMemoryHerdr().startPiPhase` silently returns an existing map entry, so the fake has stronger idempotency than production. The duplicate test invokes the second run only after the first has completed and therefore never exercises an in-flight or concurrent retry.
- why it matters: duplicate HTTP requests, overlapping retries, or a control restart while a phase is working can run two agents against the same checkout. The current passing tests are test theater for the retry behavior central to AC2/AC5.
- required fix: implement an atomic find-or-start/reattach operation keyed by workspace plus run/phase/attempt, inspect the existing agent's status, and wait on that target instead of starting another. Add an in-flight/concurrent retry test whose fake matches the live adapter's behavior.

### F3: Herdr terminal decoding fails open and cannot report blocked promptly (severity: major)

- evidence: the live adapter waits only for `--status idle`. A blocked agent therefore waits until timeout and becomes `failed`, despite the domain mapping supporting `blocked`. `mapWaitResult` does not decode the installed CLI's actual success shape (`result.agent.agent_status`); it defaults every unrecognized or malformed successful response to `idle`, hence `succeeded`. Similarly, summary parsing misses the actual `result.read.text` shape. `exited` is also mapped to success without any exit-code evidence. No live-adapter contract tests cover representative CLI responses.
- why it matters: malformed/changed CLI output can produce a false successful completion, while a genuine blocked phase is mislabeled failed. This violates the terminal/status portion of AC3/AC4 and is the opposite of fail-closed behavior.
- required fix: schema-decode the actual Herdr envelopes, treat unknown/malformed output as an error or failed outcome, and wait/poll via Herdr primitives for all terminal states needed by the phase contract. Only map process exit to success when successful exit is established. Add adapter tests with real response fixtures, including idle, blocked, timeout, malformed output, and summary output.

### F4: The HTTP completion transport is not an idempotent Inngest event sender (severity: major)

- evidence: `packages/operator/src/adapters/completion-http.ts` describes its target as the Inngest Event API but POSTs the flat internal event. Inngest requires an envelope with `name` and `data`, and uses top-level `id` for event deduplication; a nested/flat `idempotency_key` does not activate that behavior. Deduplication and `findByIdempotencyKey` rely solely on an in-process `Map`, which is empty after restart. There are no HTTP-sender tests.
- why it matters: the documented live sink will receive the wrong contract, and a restart can relaunch the phase and send the same logical completion again. Inngest will trigger duplicate runs by default when no event `id` is supplied, so AC4/AC5 are not met by the live adapter.
- required fix: define the transport contract explicitly. For Inngest, send `{ name, id: idempotency_key, data: ... }` and test the exact request with a fake fetch; for a custom relay, require it to durably enforce the key and test that contract. Recovery state also needs to survive process restart or be recoverable from Herdr/the sink so a completed phase is not relaunched.

### F5: Control defaults silently to fakes and missing live configuration fails open (severity: major)

- evidence: `apps/control/src/index.ts` defaults `CONTROL_PHASE_MODE` to `memory`, and every value other than the exact string `live` also selects memory. `makeLivePhaseLayer` defaults a missing `PHASE_COMPLETION_URL` to the guaranteed-dead `127.0.0.1:9` endpoint. The route returns 202 before the background run and reduces any subsequent launch/wait/send failure to `console.error`, with no retry or durable failure signal.
- why it matters: an omitted or mistyped environment variable produces an apparently healthy service that accepts phase jobs but neither uses Herdr nor emits events. Even explicit live mode accepts jobs knowing there may be no completion sink. This is unsafe for the operator entrypoint and makes terminal completion lossy.
- required fix: make fake mode explicit and validated, reject unknown modes, require a valid completion sink in live mode, and provide supervised retry/durable reporting for background phase failures rather than console-only loss.

### F6: “Strict” identity and idempotency schemas accept semantically empty payloads (severity: minor)

- evidence: `packages/operator/src/schema.ts` uses unconstrained `Schema.String` for all identities, repo, actor, and idempotency key. Requests such as empty `run_id`/ticket/project/repo values pass, repo is not checked as `owner/name`, and a completion key need not correspond to its run/phase/attempt/status. Tests cover missing fields and enum errors but not these malformed identities or mismatched keys.
- why it matters: empty/colliding workspace labels and inconsistent deduplication keys undermine routing and retry safety even though the object is structurally decodable.
- required fix: add non-empty identity constraints, validate the documented repo shape, and refine or validate completion events so their idempotency key agrees with their fields; add rejection tests.

## Non-findings / checked OK

- The HTTP start request includes `run_id`, ticket/project/repo identity, phase, attempt, and context refs, and invalid/missing structural fields return 400.
- The internal completion object includes the event-catalog common fields plus attempt and an idempotency key; the pure builder sets `actor: "operator"`.
- `pi -p --approve <prompt>` matches the installed `pi` CLI, and Herdr invocation is isolated behind an operator port.
- Operator/control package boundaries are preserved; operator does not import workflows or board policy.
- Targeted operator tests (18) and control tests (3) pass. Effect services/layers used in these paths typecheck and show no obvious Effect API misuse.
- The vendored Effect/skill trees are large (about 34 MiB and 2,173 tracked files) but are outside the pnpm workspace and root TypeScript references, and lint/format ignore rules cover them; I found no current monorepo/CI break attributable to packaging.

## Notes for orchestrator

- The green suite exercises memory adapters whose retry guarantees exceed the live adapter. Require live-adapter contract tests before accepting a retry/idempotency fix.
- F1–F5 affect the core live bridge and should be treated as acceptance failures, not deferred hardening.
