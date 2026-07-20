# EXPLORE — Bootstrap monorepo skeleton (run-0001)

Greenfield workspace (`VISION.md` + `docs/specs/0001-agentic-loop-system.md` only). Goal: TypeScript monorepo with packages `tracker` / `workflows` / `operator`, apps `control` / `brainstorm`, Effect v4 foundation, and root quality gates (oxlint, oxfmt, ultracite, lefthook + CI).

## Verified versions (npm / CLI, 2026-07-20)

| Tool / package | Tag / source | Version |
| --- | --- | --- |
| Node (env) | `node -v` | v25.6.1 |
| npm (env) | `npm -v` | 11.9.0 |
| **effect** | `latest` | **3.22.0** (stable) |
| **effect** | `beta` | **4.0.0-beta.99** ← use this |
| `@effect/vitest` | matching beta | **4.0.0-beta.99** (peer: `effect@^4.0.0-beta.99`, `vitest@^3\|\|^4`) |
| `@effect/platform` (legacy name) | — | consolidated into core `effect` in v4; only `@effect/platform-*` remain separate |
| **oxlint** | latest | **1.74.0** |
| **oxfmt** | latest | **0.59.0** |
| **ultracite** | latest | **7.9.4** (peers: `oxfmt>=0.1`, `oxlint^1`) |
| **lefthook** | latest | **2.1.10** |
| **typescript** | latest | **7.0.2** (also 5.9.3 available) |
| **vitest** | latest | **4.1.10** |
| **pnpm** | latest | **11.15.1** (not installed in env; `corepack` missing) |
| inngest (future, not bootstrap) | latest | 4.13.0 |

**Effect v4 note:** No stable `effect@^4` yet. Install with `effect@beta` / pin `4.0.0-beta.99`. Ecosystem is single-versioned; Schema/HTTP/etc. live under `effect` or `effect/unstable/*`. Official guidance still recommends v3 for production, but the work unit requires v4 — pin the beta and expect occasional breaking betas.

## Recommended toolchain

- **Package manager: pnpm 11** (workspaces, strict deps, preferred by requirements). Bootstrap via `npm i -g pnpm@11.15.1` (or enable corepack when available). `packageManager` field in root `package.json`.
- **Test runner: Vitest 4** + optional `@effect/vitest@4.0.0-beta.99` for Effect helpers. Fast, monorepo-native (`projects` / workspace globs), matches ultracite vitest preset.
- **TypeScript: 5.9.3** for bootstrap (broader tooling compatibility). Revisit TS 7 once oxlint/ultracite confirm support. Root project references or a single shared `tsconfig.base.json`.
- **Module system: ESM** (`"type": "module"`) — Effect v4 packages are ESM-only.

## Proposed directory tree

```text
.
├── package.json                 # private workspace root
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── tsconfig.json                # solution / references root
├── vitest.workspace.ts
├── oxlint.config.ts             # extends ultracite/oxlint/*
├── oxfmt.config.ts              # extends ultracite/oxfmt
├── lefthook.yml
├── .github/workflows/ci.yml
├── docs/                        # existing
├── packages/
│   ├── tracker/                 # board port + adapters (NO Herdr)
│   │   ├── package.json         # @agentic-loop/tracker
│   │   ├── tsconfig.json
│   │   ├── src/index.ts
│   │   └── src/index.test.ts
│   ├── workflows/               # Inngest fns + phase policy (NO pane drive)
│   │   └── … same minimal shape
│   └── operator/                # ONLY Herdr/pi phase driver
│       └── … same minimal shape
└── apps/
    ├── control/                 # ingress + Inngest serve
    │   └── … same minimal shape
    └── brainstorm/              # Telegram/Flue chat (NOT second orchestrator)
        └── … same minimal shape
```

## package.json / workspace / tsconfig decisions

**Root**

- `"private": true`, `"packageManager": "pnpm@11.15.1"`, `engines.node: ">=22"`.
- Scripts: `lint` → `oxlint .`, `format` / `format:check` → `oxfmt` / `oxfmt --check`, `check` → `ultracite check`, `test` → `vitest run`, `typecheck` → `tsc -b`.
- DevDeps at root: `typescript`, `vitest`, `oxlint`, `oxfmt`, `ultracite`, `lefthook`, `effect@4.0.0-beta.99`, `@effect/vitest@4.0.0-beta.99`, `@types/node`.
- `pnpm-workspace.yaml`: `packages: ['packages/*', 'apps/*']`.

**Workspace packages**

- Names: `@agentic-loop/{tracker,workflows,operator,control,brainstorm}`.
- Each: `"type": "module"`, `exports` → `./src/index.ts` (TS-source export OK under pnpm+vitest; ship `tsc` emit later if needed).
- Internal deps via `workspace:*` only where boundaries allow:
  - `workflows` → `tracker` (port types)
  - `operator` → may share event/payload types later (keep free of `workflows` for now)
  - `control` → `workflows`, `tracker`
  - `brainstorm` → `tracker` only (board client; no operator/workflows drive)
- Placeholder: one pure exported fn + one vitest test per package/app so CI has signal.

**tsconfig**

- `tsconfig.base.json`: `strict`, `module`/`moduleResolution` `NodeNext`, `target` `ES2022`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` if ultracite allows, `skipLibCheck`.
- Per-package `tsconfig.json` extends base; root uses project references for `tsc -b`.

**Quality config**

- Prefer hand-written ultracite presets over interactive `ultracite init` for reproducibility:
  - `oxlint.config.ts`: `ultracite/oxlint/core` + `ultracite/oxlint/vitest`
  - `oxfmt.config.ts`: spread `ultracite/oxfmt`
- `lefthook.yml`: pre-commit → `oxfmt` (staged) + `oxlint` (staged) + optional `ultracite check`; pre-push optional `vitest run` if fast enough.

## Effect v4 introduction

**Pin:** `effect@4.0.0-beta.99` (range `4.0.0-beta.99` exact or `npm:effect@beta` carefully). Prefer exact pin during beta.

**Who depends on it (bootstrap):**

- All packages/apps get `effect` as a dependency (or root catalog + workspace protocol) so the foundation is uniform.
- Minimal usage pattern for placeholders: pure `Effect` program + `Effect.runSync` / `runPromise` in a thin exported wrapper, e.g. `export const greet = (name: string) => Effect.runSync(Effect.succeed(\`ok:${name}\`))` — proves import graph without Layer/Schema complexity.
- Next vertical slices (not this scaffold):
  - `tracker`: `Context.Service` for `IssueTrackerPort`, Schema for ticket DTOs (`effect/Schema` or `effect/unstable/schema` — verify import at implement time)
  - `workflows`: pure policy as `Effect` functions; Inngest steps stay plain TS calling into Effect
  - `operator`: Effect for completion payload validation / idempotency; Herdr I/O behind a service tag
  - avoid pulling `@effect/platform-*` until Node HTTP/file needs appear

**Do not:** put Herdr clients in `tracker`/`workflows`/`brainstorm`; do not let `brainstorm` import `operator` or dispatch workflows.

## CI workflow outline (`.github/workflows/ci.yml`)

```yaml
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4 # version from packageManager
      - uses: actions/setup-node@v4 # node 22 or 24, cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint # oxlint
      - run: pnpm format:check # oxfmt --check
      - run: pnpm check # ultracite check
      - run: pnpm typecheck # tsc -b
      - run: pnpm test # vitest run
```

Local parity: lefthook pre-commit runs subset; full suite via `pnpm` scripts matching CI.

## Boundary checklist (from vision)

| Package/app | May do | Must not |
| --- | --- | --- |
| `tracker` | board port, GitHub adapter, fakes | Herdr, Inngest, Telegram |
| `workflows` | triage/dispatch/phase policy, events | drive panes / Herdr |
| `operator` | Herdr + pi phase babysitting | own board triage policy |
| `control` | HTTP ingress, serve Inngest | become chat UX |
| `brainstorm` | Telegram/Flue chat, limited board writes | second orchestrator / force-run |

## Risks / open questions

1. **Effect v4 beta churn** — APIs under `unstable/*` and beta tags can break; pin exact version; budget codemods.
2. **Schema import path** — v4 moved Schema; confirm stable `effect/Schema` vs `effect/unstable/schema` at implement time before writing DTO code.
3. **TypeScript 7 vs 5.9** — latest is 7.0.2; oxlint/ultracite/vitest maturity on TS 7 unknown → start on 5.9.3.
4. **pnpm missing in agent env** — install step must be explicit; CI uses `pnpm/action-setup`.
5. **ultracite init vs declarative configs** — declarative presets are more reviewable for dogfood; confirm exact export paths (`ultracite/oxlint/core`, `ultracite/oxfmt`) against installed 7.9.4.
6. **ESM + workspace TypeScript source exports** — fine for vitest; may need `tsx` or emit for runtime apps (`control`/`brainstorm`) later.
7. **Inngest / Flue / Herdr** — out of scope for skeleton; keep deps out until their tickets land so boundaries stay clean.
8. **Scope of placeholder Effect usage** — enough to wire the dep graph without forcing Layer architecture prematurely.

## Implement-phase checklist (next)

1. Root workspace + pnpm + tsconfig.base + vitest workspace.
2. Five package/app placeholders (fn + test each).
3. oxlint / oxfmt / ultracite configs + lefthook.
4. GitHub Actions CI as above.
5. Pin `effect@4.0.0-beta.99`; minimal Effect usage in each package.
6. Document package boundaries in root README (short).

## Implement corrections

1. **pnpm 11 `allowBuilds`**: ignored build scripts fail `pnpm` script preflight. Set `allowBuilds.lefthook: true` (and `msgpackr-extract: true`) in `pnpm-workspace.yaml` — the old `package.json#pnpm.onlyBuiltDependencies` field is ignored by pnpm 11.
2. **Ultracite preset paths confirmed**: `ultracite/oxlint/core`, `ultracite/oxlint/vitest`, `ultracite/oxfmt` work as explored; `oxlint` `extends` accepts config objects from those presets.
3. **oxlint `sort-keys`**: vitest config keys ordered `include` then `name`.
4. **oxlint vitest `prefer-describe-function-title`**: tests use `describe(fn, …)` with the imported function reference rather than a string title matching the export name.
5. **Added `.gitignore`** for `node_modules`/`dist`/build artifacts (not in explore tree; needed for a clean repo).
