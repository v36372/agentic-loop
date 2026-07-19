# Agentic Loop Vision

Agentic Loop is the system that turns conversation into delivered software work.
You talk. Tickets appear. Agents execute. The board stays honest.

This document explains the current state and direction of the project. We are still early, so iteration is fast. System design lives in [`docs/specs/0001-agentic-loop-system.md`](./docs/specs/0001-agentic-loop-system.md) and [issue #1](https://github.com/v36372/agentic-loop/issues/1).

## Why this exists

Building with agents today is usually a pile of disconnected pieces:

- chat that cannot safely change a board
- boards that do not know what is actually running
- long agent sessions that are unrecoverable black boxes
- merge/deploy steps that still depend on a human clicking around

Agentic Loop exists to own the **end-to-end control loop** with clear authority boundaries:

- **Chat UX** for intent
- **Board** for tracked work and human-visible status
- **Durable workflows** for execution truth
- **Multi-agent runtime** for real coding/research work
- **Deterministic delivery gates** for CI, merge, and verification

The product should feel hands-off without becoming reckless.

## Goal

A personal agentic build loop that is:

- easy to steer from Telegram
- strict about what may auto-run
- serial and inspectable while work is in flight
- durable across long agent sessions
- dogfooded on itself

The north star is simple:

> I describe work in chat. The system triages it, executes one ticket at a time, opens a PR, passes quality gates, merges when policy allows, verifies against the issue, and tells me only what matters.

## Current focus

Priority:

- End-to-end vertical slice on `v36372/agentic-loop`
- Board port + GitHub hybrid adapter
- Local Inngest workflows for triage, serial dispatch, and work runs
- Herdr + `pi` operator bridge for real multi-agent execution
- Tight quality gates: oxlint, oxfmt, ultracite, lefthook, CI

Next priorities:

- Full `impl` done-definition: CI wait, deterministic merge-as-me, optional deploy wait, verifier agent
- Telegram brainstormer with strict board permissions
- Transcript retention after worktree cleanup
- `research` workflow on the same execution path
- Move from local Inngest/dev machine to exe.dev VMs without redesign

## Core principles

### 1. Clear authority

Every layer owns one kind of truth:

| Concern | Authority |
| --- | --- |
| Intent and human-visible status | Issue tracker board |
| Whether work is running / failed / finished | Inngest run |
| Multi-agent pane orchestration | Herdr |
| Conversation with the operator | Brainstormer |

If those authorities blur, the system starts lying.

### 2. Chat is the steering wheel, not the factory

Telegram brainstormer is the primary human interface.
It may capture tickets and discuss blocked work.
It does **not** silently promote work into the execution lane.
Triage and dispatch remain explicit workflows.

### 3. Serial work, concurrent triage

Triage can stay light and parallel.
Real implementation work is global-serial for now.
One active work run protects Herdr, the repo tree, and operator attention.

### 4. Durable phases, not one giant RPC

Long agent work is started, then resumed through events.
Inngest sequences phases.
Herdr/`pi` perform the phase.
Completion comes back as `herdr/phase.completed`.

This is how we keep long-running agent work recoverable.

### 5. Agents do judgment; deterministic code does privilege

Agents may explore, implement, review, and verify.
Deterministic TypeScript owns privileged actions like merge-as-me.
If a step can be a boring function, it should not be an LLM.

### 6. Fail closed

- empty repo allowlist means no issue creation outside bootstrap seed rules
- unknown/unsupported kinds do not enter the work lane
- missing project/repo identity does not get silently guessed into the wrong place
- post-merge verifier rejection blocks; it does not auto-thrash production-adjacent state

### 7. Dogfood the loop

`agentic-loop` is both the control plane and the pilot work surface.
The system should build itself through Project board tickets whenever that is safer than manual heroics.

## Architecture shape

```text
Telegram brainstormer
  -> GitHub Issue + Project board
  -> triage workflow
  -> ready queue
  -> serial dispatch
  -> work run phases
       start phase
       Flue operator + Herdr + pi
       herdr/phase.completed
  -> PR / CI / merge / optional deploy / verifier
  -> board update + digest back to Telegram
```

Monorepo boundaries stay intentionally small:

- `tracker` — board port and GitHub adapter
- `workflows` — Inngest functions and phase policy
- `operator` — Herdr/`pi` phase babysitting
- `control` — ingress + Inngest serve
- `brainstorm` — Telegram/Flue chat surface

## What "done" means

For `impl`, done is delivery, not vibes:

1. explore
2. implement
3. adversarial review with bounded rework
4. PR opened
5. CI green
6. deterministic merge
7. deploy wait only if the repo has CD
8. autonomous verifier against the issue
9. only then mark done

If the system cannot honestly finish that chain, it should block with findings instead of pretending success.

## Contribution rules

- One PR = one ticket/topic when possible.
- Prefer vertical slices that are demoable on their own.
- Keep package boundaries clean:
  - `tracker` has no Herdr
  - `workflows` do not drive panes
  - `operator` is the only work-phase Herdr driver
  - `brainstorm` is not a second orchestrator
- Do not weaken allowlist, serial dispatch, or anti-loop rules for convenience.
- Prefer ports/adapters over provider-specific logic leaking into workflows.

## What we will not build first

- Multi-ticket parallel work fleets
- Manager-of-managers agent hierarchy as the default architecture
- Auto-running human `decision` tickets
- Silent board mutation from every chat message
- Merge/deploy decisions made by an LLM
- A marketplace/platform for arbitrary third-party agents
- Perfect multi-project enterprise admin before the first green dogfood loop

This list is a roadmap guardrail, not a law of physics. Strong need and strong technical rationale can change it.

## Near-term definition of success

The project is working when:

1. A ticket can be created from chat or bootstrap inject
2. triage classifies it and makes it ready
3. serial dispatch claims exactly one run
4. Herdr/`pi` complete the work phases
5. CI and merge gates run deterministically
6. verifier accepts or blocks honestly
7. Telegram gets a short digest
8. the next ready ticket can start only after the first is terminal

Until that path is real, everything else is secondary.

## Security posture

Agentic Loop will hold privileged capabilities: GitHub identity, repo write access, merge rights, and the ability to run coding agents on a machine.

That means:

- least privilege where practical
- fail-closed allowlists
- explicit actor metadata on board writes
- no hidden promotion from chat into execution
- transcripts retained carefully; secrets kept out of step outputs and issue comments

Power is the product. Control is the requirement.
