# agentic-loop

TypeScript monorepo for the agentic build loop: chat intent → board → durable workflows → multi-agent work → deterministic delivery gates.

See [`VISION.md`](./VISION.md) and [`docs/specs/0001-agentic-loop-system.md`](./docs/specs/0001-agentic-loop-system.md).

## Package boundaries

| Package / app | Role | Must not |
| --- | --- | --- |
| `@agentic-loop/tracker` | Board port + GitHub adapter | Herdr, Inngest, Telegram |
| `@agentic-loop/workflows` | Inngest functions + phase policy | Drive panes / Herdr |
| `@agentic-loop/operator` | Only Herdr/`pi` phase driver | Own board triage policy |
| `@agentic-loop/control` | Ingress + Inngest serve | Become chat UX |
| `@agentic-loop/brainstorm` | Telegram/Flue chat surface | Second orchestrator / force-run |

Allowed workspace deps (bootstrap):

- `workflows` → `tracker`
- `control` → `operator` + `workflows` + `tracker`
- `brainstorm` → `tracker` only
- `operator` has no dependency on `workflows`

## Local control (memory start-phase unit)

Runnable memory-backed path for issue #21:

```sh
pnpm --filter @agentic-loop/control start:memory
# or: CONTROL_PHASE_MODE=memory pnpm --filter @agentic-loop/control start
```

- Requires **explicit** `CONTROL_PHASE_MODE=memory` (`start:memory` sets it). Missing/unknown modes fail closed.
- Listens on `CONTROL_HOST`/`CONTROL_PORT` (defaults `127.0.0.1:8787`).
- `GET /healthz` reports process health plus bounded background phase-failure diagnostics (`degraded`, `phase_failure_count`, `last_phase_error`).
- `POST /v1/phases/start` accepts a start-phase body, returns `202` after accept, and with memory adapters records one schema-valid `herdr/phase.completed` event.

Example:

```sh
curl -sS http://127.0.0.1:8787/healthz
curl -sS -X POST http://127.0.0.1:8787/v1/phases/start \
  -H 'content-type: application/json' \
  -d '{
    "run_id": "run-local-1",
    "ticket_id": "21",
    "project_id": "1",
    "repo": "v36372/agentic-loop",
    "phase": "explore",
    "context": { "repo_checkout": "/tmp/agentic-loop" }
  }'
```

## Tooling

- **pnpm** workspaces
- **Effect v4** (`effect@4.0.0-beta.99` pinned)
- **Vitest** tests
- **oxlint** + **oxfmt** + **ultracite** + **lefthook**
- CI runs lint, format check, ultracite, typecheck, and tests

```sh
pnpm install
pnpm lint
pnpm format:check
pnpm check
pnpm typecheck
pnpm test
```

## Agent resources

- Effect skill (pi-discoverable): [`.pi/skills/effect-ts`](./.pi/skills/effect-ts)
- Vendored Effect v4 source for agent research: [`.agent_sources/effect`](./.agent_sources/effect) (effect-smol)
