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

Allowed workspace deps:

- `workflows` → `tracker`
- `control` → `workflows` + `tracker` + `operator`
- `brainstorm` → `tracker` only
- `operator` has no dependency on `workflows` (only Herdr/`pi` phase driver)

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
