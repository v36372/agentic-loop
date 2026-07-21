# run-0004 — Live Herdr phase mode

Issue: [#22 Live Herdr phase execution + reattach/wait](https://github.com/v36372/agentic-loop/issues/22)

## Selecting mode

Control refuses to start without an explicit mode:

```bash
# Memory adapter (tests / local unit path; no Herdr process)
CONTROL_PHASE_MODE=memory pnpm --filter @agentic-loop/control start
# or
pnpm --filter @agentic-loop/control start:memory

# Live Herdr CLI adapter
CONTROL_PHASE_MODE=live pnpm --filter @agentic-loop/control start
# or
pnpm --filter @agentic-loop/control start:live
```

Optional:

| Env               | Default        | Meaning                          |
| ----------------- | -------------- | -------------------------------- |
| `HERDR_BIN`       | `herdr`        | Path/name of the Herdr CLI       |
| `CONTROL_HOST`    | `127.0.0.1`    | HTTP bind host                   |
| `CONTROL_PORT`    | `8787`         | HTTP bind port                   |
| `CONTROL_BABYSIT` | on (`!== "0"`) | Fork `runPhase` after 202 accept |

Missing or unknown `CONTROL_PHASE_MODE` fails closed (no silent memory default).

## Live behavior

1. `ensureRunWorkspace` lists `workspace` + `worktree` for the repo checkout, joins by expected path `${repoCheckout}-runs/${runId}` or workspace label=`runId`, and returns the **real** path/`workspace_id`.
2. On miss, creates a worktree with `--label <runId>`; on create conflict, re-queries instead of inventing `ws-${runId}`.
3. `startPiPhase` uses agent name `${run_id}-${phase}-${attempt}`. Existing agents reattach. Start conflicts re-query and attach to the winner (no blind second spawn).
4. `waitAgentTerminal` polls `agent get` and maps `idle`/`done`/`blocked`/`unknown`/`timed_out`; malformed envelopes fail closed.
5. Completions use the same `herdr/phase.completed` builder as the memory slice.

## Completion sink note

HTTP/Inngest completion delivery is **#23**. Live mode currently pairs Herdr CLI with the process-local recording sender so the completion contract and start-phase unit stay intact without requiring a sink URL.

## CI

Operator CLI fixture tests inject a fake `run` function. CI does **not** need a live Herdr daemon.

## Local smoke (optional, not CI)

With Herdr running and a checkout of the monorepo:

```bash
export CONTROL_PHASE_MODE=live
export CONTROL_BABYSIT=0
export CONTROL_PORT=8787
pnpm --filter @agentic-loop/control start

curl -sS -X POST "http://127.0.0.1:8787/v1/phases/start" \
  -H 'content-type: application/json' \
  -d '{
    "run_id": "smoke1",
    "ticket_id": "22",
    "project_id": "1",
    "repo": "v36372/agentic-loop",
    "phase": "explore",
    "kind": "impl",
    "context": { "repo_checkout": "/path/to/agentic-loop" }
  }'
```

Expect `202` with a real `workspace_id` from Herdr (not `ws-smoke1`). Set `CONTROL_BABYSIT=1` only when you want the process to launch/wait on `pi`.
