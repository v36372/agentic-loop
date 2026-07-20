# EXPLORE — Operator phase bridge (run-0002 / #8)

Scaffold: `packages/operator` is a ping stub; `control` does not depend on it. Goal: local path `HTTP → operator → Herdr/pi → herdr/phase.completed` with ports so CI needs no live Herdr. No full Inngest / work-impl policy (#9).

## Verified env

| Item | Notes |
| --- | --- |
| effect `4.0.0-beta.99` | `Schema`, `Context.Service`, `Layer` on main export |
| Schema | `Struct`, `Literals`, `optionalKey`, `decodeUnknownEffect/Sync` OK |
| herdr / pi | CLIs present; worktree/workspace/agent/wait over socket API |
| checkout | linked worktree under `agentic-loop-runs/run-0002` |

Herdr ops behind port: list/create worktree+workspace by `run_id` label; `agent start … -- pi`; `agent wait --status idle`; optional `workspace report-metadata` tokens.

## Boundaries

| Who | Does | Must not |
| --- | --- | --- |
| `operator` | only Herdr/`pi` driver, schemas, completion emit | board triage / Inngest policy |
| `control` | thin HTTP start-phase; wires live adapters | pane orchestration |
| `workflows` | later HTTP client to start-phase | import Herdr / drive panes |

Add `control` → `@agentic-loop/operator`. Operator stays free of `workflows`.

## API

### HTTP — `POST /v1/phases/start` (202 async)

```ts
// request
{
  run_id, ticket_id, project_id, repo,  // repo: "owner/name"
  kind?: "impl" | "research",
  phase: "explore" | "implement" | "review",
  attempt?: number,                     // default 1; rework = implement + attempt>1
  context: {
    issue_url?, refs?: Record<string,string>,
    prompt?, repo_checkout?             // base git path for worktree
  },
  actor?: string                        // default "control"
}
// 202: { accepted, run_id, phase, attempt, workspace_id? }
```

Curl-first; no Inngest serve required this ticket.

### Operator functions

```ts
startPhase(req): Effect<StartPhaseAccepted, StartPhaseError, Deps>
runPhase(req): Effect<PhaseCompletedEvent, PhaseRunError, Deps>
buildPhaseCompleted(input): PhaseCompletedEvent
idempotencyKey(run_id, phase, attempt, status): string
// → `${run_id}:${phase}:${attempt}:${status}`
```

`startPhase` = validate + ensure workspace + fork/fire `runPhase`.  
`runPhase` = ensure → launch pi → wait terminal → map status → idempotent `send`.

## Ports

```ts
class HerdrPort extends Context.Service<
  HerdrPort,
  {
    findWorkspaceByRunId(runId): Effect<Option<HerdrWorkspace>>;
    ensureRunWorkspace(input: {
      runId;
      repo;
      repoCheckout;
      branchHint?;
    }): Effect<HerdrWorkspace>; // create-or-reattach; no blind dup
    startPiPhase(input: {
      workspaceId;
      cwd;
      agentName;
      argv: ReadonlyArray<string>;
    }): Effect<HerdrAgentHandle>;
    waitAgentTerminal(target, { timeoutMs }): Effect<AgentTerminalStatus>;
    // idle | blocked | unknown | timed_out | exited
    readAgentSummary(target): Effect<string | undefined>;
  }
>() {}

class PhaseCompletionSender extends Context.Service<
  PhaseCompletionSender,
  {
    send(event: PhaseCompletedEvent): Effect<void>;
  }
>() {}
```

Adapters: `HerdrCli` (live), `InMemoryHerdr` (tests), `HttpPhaseCompletionSender` (Inngest/event URL), `RecordingPhaseCompletionSender` (test ledger + de-dupe).

## Schemas (Effect Schema)

```ts
WorkPhase = Literals(["explore", "implement", "review"]);
// rework = phase "implement" + attempt > 1 (no separate enum value)

PhaseTerminalStatus = Literals(["succeeded", "failed", "cancelled", "blocked"]);

PhaseCompletedEvent = Struct({
  name: Literal("herdr/phase.completed"), // or transport envelope
  run_id,
  ticket_id,
  project_id,
  repo: String,
  kind: optionalKey(Literals(["impl", "research"])),
  phase: WorkPhase,
  attempt: Number, // ≥1
  status: PhaseTerminalStatus,
  summary: optionalKey(String),
  refs: optionalKey(Record(String, String)),
  actor: String, // "operator"
  idempotency_key: String,
});
```

Status map v1: agent `idle` → `succeeded`; `blocked` → `blocked`; timeout/crash → `failed`.

## Reattach / idempotency

1. **Workspace key:** label/metadata token = `run_id`. `ensureRunWorkspace` lists first; reuses open workspace; creates worktree+workspace only if missing.
2. **Agent name:** `${run_id}-${phase}-${attempt}` — retry waits/reattaches instead of second spawn while `working`.
3. **Completion key:** `${run_id}:${phase}:${attempt}:${status}`. Sender: duplicate key = no-op success.
4. **Short-circuit:** if key already sent, return prior event without relaunching pi.
5. **Never** blind `worktree create` when workspace already maps to `run_id`.

## File tree

```text
packages/operator/src/
  index.ts, phase.ts, schema.ts, ports.ts, idempotency.ts, prompts.ts
  adapters/{herdr-cli,herdr-memory,completion-http,completion-recording}.ts
  phase.test.ts, schema.test.ts
apps/control/src/
  http.ts          # node:http (or thin effect/unstable/http) + POST route
  layers.ts        # live Layer composition
  http.test.ts     # optional, memory layers
```

Control: dep on operator; after 202, `Effect.runFork(runPhase)` for local babysit. Live Layer = `HerdrCli` + env-based completion URL.

## Test plan (no live Herdr)

1. Schema accept/reject required fields + unknown phase.
2. Stable `idempotencyKey`.
3. `runPhase` happy: memory herdr + recording sender → one completion, required fields, `actor: "operator"`.
4. Reattach: second `ensureRunWorkspace` same `run_id` → same workspace id.
5. Dup completion: second send same key harmless; post-terminal retry no double-emit.
6. Fail map: `blocked` / `timed_out` → emit `blocked` / `failed`.

## Risks / open questions

1. CLI spawn vs raw socket — CLI JSON envelopes enough for v1.
2. Completion sink pre-Inngest — env `PHASE_COMPLETION_URL` (stub or Event API).
3. Worktree layout — prefer `agentic-loop-runs/<run_id>`; branch naming TBD.
4. Long `runPhase` in control process OK for slice; later Flue worker, same ports.
5. `exactOptionalPropertyTypes` + `optionalKey` care.
6. Prompts minimal now; rich CODER/reviewer text under #9.
7. `herdr/phase.started` / verifier phase out of scope.

## Implement checklist

1. `schema.ts` + decode tests.
2. Ports + Recording sender + InMemory Herdr.
3. `idempotencyKey` / `buildPhaseCompleted`.
4. `runPhase` / `startPhase` + unit tests (happy, reattach, dup, fail).
5. `prompts.ts` argv (`pi -p …`).
6. Optional `HerdrCli` (not required for CI green).
7. `HttpPhaseCompletionSender` + env.
8. Control HTTP route + Layer; memory-backed handler test optional.
9. Export surface; README: `control → operator`.
10. `pnpm lint/format/check/typecheck/test` green without Herdr.

## Implement corrections

1. **Ports split into two files** (`herdr-port.ts`, `completion-port.ts`) because ultracite `max-classes-per-file` forbids two `Context.Service` classes in one module; `ports.ts` remains a thin re-export.
2. **`PhaseCompletionSender.findByIdempotencyKey`** added so `runPhase` can short-circuit after a prior terminal completion without relaunching pi.
3. **Port method error channel is `Error`** so live CLI/HTTP adapters typecheck under `exactOptionalPropertyTypes`.
4. **Herdr CLI uses `execFile` + `promisify`** (not `node:child_process/promises`) for Node types compatibility in this toolchain.
5. **Control HTTP uses `node:events.once` + `promisify(server.close)`** to satisfy `promise/avoid-new` while still wrapping Node callback APIs.
6. **Top-level await in `apps/control/src/index.ts`** for entrypoint `main()` (ESM); `CONTROL_PHASE_MODE=memory|live`, `CONTROL_PORT`, `PHASE_COMPLETION_URL`, `HERDR_BIN` env knobs.

## Rework corrections (review-1 F1–F6)

1. **F1 workspace reattach (fail-closed):** live adapter queries `workspace list` + `worktree list --json`, resolves via real `path` + `open_workspace_id` / label (never empty path / never fabricates `ws-*`). List/decode errors fail. Create conflict re-queries; no invent-on-parse-fail.
2. **F2 in-flight agent reattach:** `startPiPhase` is find-or-start (`agent get` first). Memory adapter mirrors with `startCountByAgent` + `reattached`. Concurrent retry test asserts single start.
3. **F3 terminal decode:** schema-decode Herdr envelopes (`result.agent.agent_status`, `result.read.text`). Wait polls `agent get` for idle|done|blocked|unknown; timeout → timed_out; malformed → error. Success only for idle/done.
4. **F4 Inngest envelope:** HTTP sender POSTs `{ name, id: idempotency_key, data }`; fake-fetch tests cover shape + local de-dupe. Transport `id` is the durable key across restarts.
5. **F5 control fail-closed:** `CONTROL_PHASE_MODE` validated (`memory`|`live` only); live requires valid `PHASE_COMPLETION_URL`. Background failures recorded in ledger + `/healthz` + structured JSON log.
6. **F6 identity schemas:** non-empty identities, `owner/name` repo, completion key must match fields; rejection tests added.
