# IMPLEMENT — run-0003 / #21 memory start-phase unit

## Goal

Land the smallest runnable local unit:

`POST /v1/phases/start` → operator (memory Herdr + recording completion sender) → one schema-valid `herdr/phase.completed`.

No live Herdr CLI, no live HTTP/Inngest completion adapter, no durable outbox.

## Extraction source

Reference only: PR #19 (`run-0002/operator-phase-bridge`) memory path. Do **not** merge live adapters or silent memory defaults.

## What landed

### `packages/operator`

- Schemas: `StartPhaseRequest`, `StartPhaseAccepted`, `PhaseCompletedEvent`
- Safe `RunId` token (rejects path traversal, separators, whitespace, bare `.`/`..`, overlong)
- `RepoRef` owner/name pattern
- Ports: `HerdrPort`, `PhaseCompletionSender`
- Pure helpers: idempotency key, completion builder, status map, expected run path
- `startPhase` / `runPhase` application service
- Memory adapters only:
  - `InMemoryHerdr` (+ reattach find-or-start)
  - `RecordingPhaseCompletionSender` (duplicate key no-op)
- Unit tests for schema validation, completion payload, happy path, reattach, dup emit, fail map

### `apps/control`

- Thin `node:http` routes:
  - `GET /healthz` — `ok`, `degraded`, bounded failure ledger diagnostics
  - `POST /v1/phases/start` — parse → accept (202) → optional detached babysit
- Explicit memory wiring only (`CONTROL_PHASE_MODE=memory` required)
- Runnable entrypoint via `tsx`:
  - `pnpm --filter @agentic-loop/control start:memory`
  - or `CONTROL_PHASE_MODE=memory pnpm --filter @agentic-loop/control start`
- Background failures: bounded ledger (`MAX_PHASE_FAILURES=32`), structured log, health degradation
- Tests: validation, happy path, failure diagnostics, package start smoke → `/healthz`

## Hard residual fixes from PR #19 reviews

| Residual                | Fix in this unit                                |
| ----------------------- | ----------------------------------------------- |
| Silent memory default   | No default; missing/unknown mode fails closed   |
| Unsafe `run_id`         | Bounded safe-token schema + rejection tests     |
| Background failure loss | Bounded ledger + `/healthz.degraded`            |
| No runnable entrypoint  | `start` / `start:memory` via `tsx` + smoke test |

## How to run

```sh
pnpm install
pnpm --filter @agentic-loop/control start:memory
curl -sS http://127.0.0.1:8787/healthz
```

## Quality gates

- `pnpm check`
- `pnpm typecheck`
- `pnpm test`

## Out of scope (intentional)

- Live Herdr worktree/workspace create/reattach
- Live HTTP completion / Inngest serve
- Durable outbox / process-restart recovery
- Full work-impl policy machine

## Residual risks

1. Background babysit is process-local; restart loses in-flight work and the failure ledger.
2. Memory adapters are stronger on reattach than any future live adapter will be until live work is ticketed separately.
3. Package exports still point at TypeScript sources; runtime path is `tsx`, not built `dist` Node resolution.
