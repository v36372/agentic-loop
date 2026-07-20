# Review #1 — run-0001 monorepo scaffold

## Verdict

APPROVE

## Findings

### F1: Declared Node floor is lower than the pinned toolchain supports (severity: minor)

- evidence: root `package.json` declares `engines.node: ">=22"`, while pinned `oxfmt@0.59.0` declares `^20.19.0 || >=22.12.0`; the resolved ESLint peer used by `ultracite@7.9.4` declares `^20.19.0 || ^22.13.0 || >=24`. CI's floating Node 22 currently resolves to a compatible release, but the repository claims compatibility with Node 22.0–22.11.
- why it matters: a developer can satisfy the repository's advertised engine constraint and still encounter engine warnings or broken quality tooling during bootstrap.
- required fix: raise the root Node 22 floor to the strictest pinned-tool requirement (currently `>=22.13.0`), or declare an equivalent supported range and pin CI to a compatible version.

### F2: The typecheck gate excludes tests and TypeScript tool configs (severity: minor)

- evidence: every package/app `tsconfig.json` excludes `src/**/*.test.ts`; root `tsconfig.json` has `files: []` and references only those projects. Root and per-project `vitest*.ts`, `oxlint.config.ts`, and `oxfmt.config.ts` are therefore also outside `pnpm typecheck`.
- why it matters: Vitest transpiles tests without performing a full TypeScript check, so type-invalid tests can pass both `pnpm test` and the advertised CI typecheck. Config files likewise lack a static gate.
- required fix: add a no-emit typecheck project that includes tests and TypeScript configs, or otherwise include them in the CI typecheck graph.

### F3: Lefthook installation fails open (severity: minor)

- evidence: root `package.json` uses `"prepare": "lefthook install || true"`, even though `lefthook` is pinned and explicitly allowed to build in `pnpm-workspace.yaml`.
- why it matters: any real installation error is silently converted to success, leaving developers without the required local quality hooks and no indication that the gate is absent.
- required fix: let `lefthook install` failures surface, or narrowly handle only an intentional unsupported context while preserving errors in normal repository installs.

## Non-findings / checked OK

- All five required workspaces exist with the expected names, one exported Effect-backed placeholder function, and one discovered passing test each.
- The package graph exactly matches the allowed internal dependencies: `workflows` → `tracker`, `control` → `workflows` + `tracker`, `brainstorm` → `tracker`; `operator` has no internal dependency and remains free of `workflows`.
- No forbidden Herdr, pane-driving, Inngest, Telegram, or orchestrator imports/dependencies leaked across boundaries.
- `effect` and `@effect/vitest` are exactly pinned to `4.0.0-beta.99`; the lockfile resolves one matching Effect version. The exercised `Effect.succeed`/`Effect.runSync` API works with that pin.
- Root oxlint, oxfmt, Ultracite, and Lefthook configs are present and load successfully. `lefthook validate` passes.
- CI triggers on both push and pull request and runs frozen install, lint, format check, Ultracite, typecheck, and tests.
- A clean `tsc -b` rebuild succeeds; all five tests pass. Frozen offline installation also succeeds with the committed lockfile.
- `.gitignore` covers dependencies, build output, TypeScript build metadata, coverage, caches, logs, and local environment files.
- README accurately documents the workspace roles, forbidden responsibilities, dependency graph, Effect pin, and quality commands.
- The `VISION.md` and system-spec diffs are formatter-only paragraph/table reflow and blank-line normalization; no requirement or architectural meaning changed. They are acceptable in this formatter-bootstrap work unit, and `git diff --check` is clean.
- Placeholder tests are intentionally minimal but do execute the Effect-backed exports and allowed workspace edges; that matches this scaffold's explicit scope rather than constituting test theater.

## Notes for orchestrator

- No blocker or major finding remains, so the verdict is APPROVE under the supplied verdict rules.
- The three minor findings are quality-hardening follow-ups and do not negate compliance with the requested bootstrap scope.
