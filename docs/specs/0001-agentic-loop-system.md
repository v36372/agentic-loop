## Problem Statement

I want a hands-off agentic build loop. I brainstorm and refine intent in chat; the system turns that into tickets on a GitHub Project board, triages them, and executes work serially on a VM using multi-agent sessions. I do not want to manually triage tickets, click board columns, babysit coding agents, or merge by hand when policy says the change is good.

Today those pieces are disconnected: chat, issue tracking, durable workflow orchestration, and multi-agent terminal control each solve part of the problem, but nothing owns a single end-to-end control loop with clear authority boundaries. Without that, work duplicates, status lies, and long agent sessions become unrecoverable black boxes.

## Solution

Build **agentic-loop**: a TypeScript monorepo that connects:

- **Telegram brainstormer** (Flue agent) as my only day-to-day UI
- **GitHub Issues + Project fields** as the board for intent and human-visible status
- **Inngest** as execution truth for runs, phases, waits, and serial dispatch
- **Flue phase operator + Herdr + `pi`** as the worker runtime on a VM
- **Deterministic GitHub actions** (CI wait, merge as me) for delivery gates

I talk on Telegram. Tickets appear on the Project board. A light triage workflow classifies and promotes them. A global serial worker claims one ticket at a time, runs explore/implement/review (and later CI/merge/deploy/verify for `impl`), writes status back to the board, and digests meaningful outcomes back to Telegram. The system dogfoods itself by building `v36372/agentic-loop` through that same board.

## User Stories

1. As the operator (me), I want to talk to a brainstorming agent on Telegram, so that I never have to use the GitHub UI for routine board work.
2. As the operator, I want the brainstormer to turn an agreed spec into tickets, so that intent becomes tracked work.
3. As the operator, I want tickets created with status `open` and `needs-triage`, so that nothing enters the work lane without classification.
4. As the operator, I want triage to assign kind and priority automatically, so that I do not manually label or order work.
5. As the operator, I want only triaged tickets to become `ready for dev`, so that draft thinking does not spawn workers.
6. As the operator, I want `decision` tickets never auto-executed, so that human judgment is not silently completed by agents.
7. As the operator, I want one global active implementation run at a time, so that Herdr and my attention are not contended.
8. As the operator, I want many tickets to wait in `ready for dev` safely, so that triage can run ahead of execution.
9. As the operator, I want triage to run independently of the work lane, so that classification is not blocked behind a long implement run.
10. As the operator, I want each work ticket to map to exactly one Inngest run, so that retries and status have a clear identity.
11. As the operator, I want Inngest to be the execution authority, so that the board cannot disagree about whether work is actually running.
12. As the operator, I want the board to remain the authority for intent, kinds, and human-visible status, so that I can inspect work without reading workflow internals.
13. As the operator, I want system status writes to never re-trigger triage or dispatch, so that the loop cannot ping-pong itself.
14. As the operator, I want brainstormer board permissions to be limited, so that chat eagerness cannot force-run or force-done work.
15. As the operator, I want meaningful digests only (started, rework, done, blocked/failed/cancelled), so that Telegram stays useful instead of noisy.
16. As the operator, I want `blocked` tickets to free the work lane, so that one stuck ticket cannot freeze the factory.
17. As the operator, I want blocked findings summarized to Telegram, so that I can decide next action without opening logs first.
18. As the operator, I want re-entry of blocked work to go through needs-triage or explicit guidance, so that reruns are intentional.
19. As a triage workflow, I want to read ticket body and board context, so that I can choose kind and priority.
20. As a triage workflow, I want to clear `needs-triage` when finished, so that tickets are not triaged forever.
21. As a triage workflow, I want missing/invalid project or repo data to park the ticket, so that work is not started on the wrong home.
22. As a dispatch workflow, I want to claim only eligible ready tickets with supported kinds, so that unimplemented kinds do not enter the worker.
23. As a dispatch workflow, I want claim to be singleton/serial, so that two work runs cannot start together.
24. As a work run, I want phase outputs checkpointed, so that a later phase can resume without redoing earlier success.
25. As a work run, I want to start each long phase and wait for `herdr/phase.completed`, so that HTTP calls are not held open for the whole agent session.
26. As a phase operator, I want Herdr as my only multi-agent orchestration tool, so that pane/agent control stays centralized.
27. As a phase operator, I want to launch `pi` with phase-specific prompts, so that explorer/worker/reviewer/verifier share one CLI with different missions.
28. As a phase operator, I want to reattach by `run_id`, so that retries do not spawn duplicate workspaces blindly.
29. As an `impl` run, I want explore → implement → review with N=2 rework, so that obvious review findings can be fixed once automatically.
30. As an `impl` run, I want no review findings to mean approve, so that approval is mechanical and auditable.
31. As an `impl` run, I want a PR opened for the change, so that delivery has a durable GitHub artifact.
32. As an `impl` run, I want to wait for CI green before merge, so that broken lint/format/tests never merge.
33. As an `impl` run, I want merge performed by deterministic TypeScript using my GitHub identity, so that merge is not an LLM action.
34. As an `impl` run, I want deploy wait only when repo config says CD exists, so that repos without CD are not stuck.
35. As an `impl` run, I want a verifier agent after merge/deploy, so that delivery is checked against the issue autonomously.
36. As an `impl` run, I want verifier rejection to block rather than auto-rework, so that post-merge failures get deliberate handling.
37. As a `research` run, I want explore → write findings → done on the same Herdr path, so that runtime models stay consistent without adversarial review.
38. As the operator, I want on-disk run isolation via Herdr worktrees/workspaces keyed by `run_id`, so that serial tickets do not corrupt each other’s trees.
39. As the operator, I want worktrees removed at run end but transcripts kept, so that disks stay clean without losing history.
40. As the operator, I want issue comments to include summaries and transcript links, so that the board remains the narrative record.
41. As the operator, I want transcripts to target Cloudflare R2 later, so that large logs are not forced into git or issue bodies.
42. As the operator, I want a tracker port/adapter, so that GitHub is replaceable without rewriting workflows.
43. As the operator, I want hybrid Issue + Project fields, so that discussion lives on issues while status/priority live on the board.
44. As the operator, I want multi-project identity from day one, so that a second project does not require redesign.
45. As the operator, I want v1 to auto-discover the single existing GitHub Project, so that bootstrap is simple.
46. As the operator, I want issues created in the target repo, so that work lives next to the code it affects.
47. As the operator, I want a repo allowlist fail-closed model, so that the system cannot open issues in arbitrary repos.
48. As the operator, I want `v36372/agentic-loop` seeded as the first allowlisted and fallback repo, so that self-build is possible.
49. As the operator, I want brainstormer to add repos on demand through config changes, so that allowlist growth is explicit.
50. As a developer bootstrapping the system, I want a local Inngest dev server first, so that I can iterate without cloud deploy.
51. As a developer, I want a path to exe.dev VMs later, so that local architecture does not hardcode one machine forever.
52. As a developer, I want webhook relay support, so that GitHub events can reach local/dev ingress.
53. As a developer, I want bootstrap CLI event inject, so that early end-to-end tests do not depend on perfect webhook setup.
54. As a developer, I want GitHub PAT auth as my identity in v1, so that merge-as-me and board writes are straightforward.
55. As a developer, I want a TS monorepo with `tracker`, `workflows`, `operator` packages and `control`/`brainstorm` apps, so that boundaries stay clear without package explosion.
56. As a developer, I want oxlint, oxfmt, ultracite, lefthook, and CI lint+test, so that quality gates are tight locally and remotely.
57. As a developer, I want the first full E2E success to include CI, merge, optional deploy, and verifier, so that “done” means delivered rather than merely coded.
58. As a developer, I want one reviewer in v1, so that the loop ships before multi-adversarial topology.
59. As a developer, I want event names stabilized early, so that ingress, waits, and notify do not thrash contracts.
60. As a future integrator, I want deploy topology flexible, so that control plane and worker plane can split across machines without redesign.
61. As a future integrator, I want Telegram to remain a client of the board/control APIs, so that terminal skills or other channels can be added later.
62. As a future integrator, I want R2 behind a transcript port, so that storage can change without workflow rewrites.
63. As the operator, I want cancelled tickets to stop active runs, so that abandoned work does not continue burning resources.
64. As the operator, I want priority changes to reorder the queue without starting a second concurrent run, so that I can steer without breaking serial execution.
65. As the operator, I want dogfooding tickets for building agentic-loop itself on Project #1, so that the product is built through its own board.

## Implementation Decisions

### Authority model

- **Execution truth:** Inngest run state.
- **Intent / human-visible board truth:** GitHub Issue content + Project fields via `IssueTrackerPort`.
- **Chat UX:** Flue brainstormer + Telegram.
- **Multi-agent runtime:** Herdr workspaces/panes launching `pi`.
- **Phase babysitter:** headless Flue operator whose work-orchestration tool is Herdr.
- Brainstormer, triage, operator, and board writes are distinct actors; every mutating event carries `actor` and correlation ids (`run_id`, `ticket_id`, `project_id`).

### Board model (GitHub hybrid)

- Canonical ticket identity = GitHub Issue.
- Project fields carry status and priority/order.
- Labels carry `needs-triage` and `kind:*`.
- Required ticket identity fields include `project_id` and repo.
- v1 auto-discovers the single user Project and uses it; interface remains multi-project capable.
- Status vocabulary: `open`, `ready for dev`, `in progress`, `in review`, `blocked`, `done`, `failed`, `cancelled`.
- Kind vocabulary: `impl`, `research`, `ops`, `decision`, `chore`.
- v1 auto-run kinds: **`impl` and `research` only**. `decision` never auto-runs. `ops`/`chore` may be tagged but are not claimed yet.

### Repo placement and allowlist

- Issues are created in the **target repo** (not a meta-only board repo).
- Allowlist config is fail-closed; brainstormer can add repos on demand.
- Seed/fallback repo: `v36372/agentic-loop`.
- Pilot/control repo is the same: `v36372/agentic-loop`.
- Per-repo config eventually includes CD flag and any merge/verify policy needed for gates.

### Lanes and scheduling

- **Triage lane:** light, no Herdr, limited concurrency, triggered by `needs-triage`.
- **Work lane:** global serial concurrency = 1 across all projects.
- **`dispatch-next`:** on readiness and on terminal runs, claims highest-priority eligible ready ticket with supported kind and no open blockers.
- Kind is frozen into run payload at claim time.
- System status/progress writes never enqueue triage/work start.
- Brainstormer does not promote to `ready for dev`; triage does.

### Brainstormer permissions

- May create tickets after user asks to capture/spec them.
- May set project/repo when unambiguous.
- Adds `needs-triage` on create.
- Must ask before cancel, force-done, or rekind after triage.
- Notify digests do not auto-requeue work except by explicit re-triage path after human discussion when needed.

### Inngest workflow set (v1)

- `triage-ticket`
- `dispatch-next`
- `work-impl`
- `work-research`
- `notify-brainstorm`
- Local `inngest dev` first; later deploy control/workers to exe.dev VMs.

### Work phase machine

- Long phases use: short `step.run(start-phase)` + `waitForEvent("herdr/phase.completed")` matched on `run_id` + `phase`.
- No `waitForSignal` in v1.
- Flue operator emits `herdr/phase.completed` with strict payload and idempotency key.

**`impl` path**

1. claim / `in progress`
2. explore
3. implement
4. adversarial review (single `pi` reviewer in v1)
   - no findings → approve
   - findings → rework implement up to **N=2** total implement attempts path as locked
   - exhausted → `blocked`
5. open PR
6. wait `github/ci.completed` green
7. deterministic TypeScript merge as user identity
8. if `has_cd`: wait `github/deploy.completed`; else skip
9. verifier agent (autonomous judgment against issue)
   - approve → `done`
   - findings → `blocked` (no auto-rework post-merge)
10. finalize board + transcript summary + free lane + terminal event

**`research` path**

- claim → explore → write findings → `done`
- same Herdr/operator execution style, fewer phases, no adversarial review.

### Herdr / isolation / cleanup

- Use Herdr-native worktrees and workspaces keyed by `run_id`.
- All phase agents for a run attach to that workspace/checkout.
- On terminal state: delete local worktree/workspace, **keep transcript**.
- Transcript target: issue summary/link now + Cloudflare R2 later via `TranscriptStore` port.
- Operator must be idempotent on retry (reattach by `run_id`).

### Auth / ingress / bootstrap

- GitHub PAT as user identity for board/PR/merge.
- GitHub → webhook relay → control ingress → normalized events.
- Bootstrap CLI/event inject allowed until relay/Telegram are live, then removed/disabled.
- First bootstrap seeds monorepo, CI, labels/fields, allowlist, and enough control plane to dogfood.

### Monorepo shape

- Packages: `tracker`, `workflows`, `operator`
- Apps: `control`, `brainstorm`
- Root quality: oxlint, oxfmt, ultracite, lefthook
- CI: lint + format check + ultracite + tests on PR/push
- `has_cd: false` for pilot until exe.dev deploy events exist

### Internal event catalog

- `board/ticket.created`
- `board/ticket.needs_triage`
- `board/ticket.ready_for_dev`
- `board/ticket.cancelled`
- `work/run.claimed`
- `herdr/phase.started`
- `herdr/phase.completed`
- `github/ci.completed`
- `github/deploy.completed`
- `work/run.terminal`

Common fields: `run_id?`, `ticket_id`, `project_id`, `repo`, `kind?`, `phase?`, `status`, `summary?`, `refs?`, `actor`.

### Test seams (accepted)

1. **Primary:** `IssueTrackerPort` with in-memory/fake adapter for lifecycle and anti-loop behavior.
2. **Normalized event contract** fixture/schema tests.
3. **Work run phase policy machine** in workflows (next step/status/events), not Herdr internals.
4. **Operator completion emit** unit seam with fake sender.
5. **Quality gate seam** via CI/lefthook tooling. Non-seams: Octokit details, Herdr pane choreography, Telegram copy, R2 internals.

## Testing Decisions

### What good tests are

- Test **external behavior** at the highest accepted seams.
- Assert board-visible outcomes, emitted normalized events, and phase-policy decisions.
- Do not assert prompt text, pane ids, or private function structure.
- Prefer deterministic fakes over live GitHub/Herdr for unit/policy tests.
- Live integration tests are sparse and optional behind credentials.

### Modules to test

- `tracker` port semantics and GitHub adapter mapping (adapter tests limited).
- `workflows` triage eligibility, dispatch serial claim, impl/research phase policy, anti-loop filters.
- event normalization from GitHub webhook fixtures.
- operator completion payload validation/idempotency.
- CI/quality config smoke (lint/format/test run in CI).

### Prior art

- Greenfield repository: no existing test suite or domain glossary.
- Establish first test patterns around port + policy seams so later packages copy them.
- When similar systems exist in other local projects, reuse only the port/adapter testing style, not their domain models.

### Minimum confidence for “E2E up”

- Simulated board events can drive triage → ready → claim → phase completion fixtures → terminal board state.
- One real pilot path on `agentic-loop` can open PR, pass CI, merge, verify, and mark `done` or `blocked` correctly.

## Out of Scope

- Parallel multi-adversarial reviewers (v1 is one reviewer).
- Auto-run workflows for `ops` and `chore`.
- Auto-execution of `decision` tickets.
- `waitForSignal` based wakeups.
- GitHub App auth migration.
- Cloudflare R2 implementation beyond port + temporary non-R2 adapter.
- Multi-project explicit registry UX beyond single-project auto-discover.
- Always-on multi-VM production topology (exe.dev later).
- Terminal skill as primary UX (Telegram brainstormer is primary; skill may come later).
- Automatic post-verifier code rework after merge.
- Human manual board operation as a required path.
- Non-TypeScript control plane.
- Building a general marketplace agent platform unrelated to this loop.

## Further Notes

- This system is intentionally **dogfooded**: Project #1 + `v36372/agentic-loop` are both the product home and the pilot work surface.
- Speed strategy: keep the full done-definition as the target, but bootstrap with local Inngest, webhook relay or inject, and a friendly pilot repo quality stack before generalizing.
- Deploy topology is flexible: one VM is fine initially if package/app boundaries remain moveable.
- If Project status option names differ from the draft vocabulary, the GitHub adapter should map them rather than forcing workflows to speak GitHub UI strings.
- Safe defaults when uncertain: fail closed on allowlist, free the serial lane on block/cancel, and prefer `blocked` over fake success.
