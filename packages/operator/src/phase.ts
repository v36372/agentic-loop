import { Effect, Option } from "effect";

import { PhaseCompletionSender } from "./completion-port.js";
import { HerdrPort } from "./herdr-port.js";
import {
  agentNameFor,
  buildPhaseCompleted,
  mapAgentStatus,
  resolveAttempt,
} from "./idempotency.js";
import { buildPiArgv } from "./prompts.js";
import type {
  PhaseCompletedEvent,
  StartPhaseAccepted,
  StartPhaseRequest,
} from "./schema.js";

export const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;

export type PhaseDeps = HerdrPort | PhaseCompletionSender;

export interface RunPhaseOptions {
  readonly timeoutMs?: number;
}

const repoCheckoutOf = (req: StartPhaseRequest): string =>
  req.context.repo_checkout ?? process.cwd();

const findPriorCompletion = (
  sender: PhaseCompletionSender["Service"],
  runId: string,
  phase: StartPhaseRequest["phase"],
  attempt: number
): Effect.Effect<Option.Option<PhaseCompletedEvent>, Error> =>
  Effect.gen(function* findPrior() {
    for (const status of [
      "blocked",
      "cancelled",
      "failed",
      "succeeded",
    ] as const) {
      const key = `${runId}:${phase}:${attempt}:${status}`;
      const prior = yield* sender.findByIdempotencyKey(key);
      if (Option.isSome(prior)) {
        return prior;
      }
    }
    return Option.none();
  });

/**
 * Full phase babysit: ensure workspace → launch pi → wait → emit completion.
 * Idempotent on retry via workspace reattach + completion key short-circuit.
 */
export const runPhase = (
  req: StartPhaseRequest,
  options: RunPhaseOptions = {}
): Effect.Effect<PhaseCompletedEvent, Error, PhaseDeps> =>
  Effect.gen(function* runPhaseGen() {
    const herdr = yield* HerdrPort;
    const sender = yield* PhaseCompletionSender;
    const attempt = resolveAttempt(req);
    const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;

    const prior = yield* findPriorCompletion(
      sender,
      req.run_id,
      req.phase,
      attempt
    );
    if (Option.isSome(prior)) {
      return prior.value;
    }

    const workspace = yield* herdr.ensureRunWorkspace({
      repo: req.repo,
      repoCheckout: repoCheckoutOf(req),
      runId: req.run_id,
    });

    const agentName = agentNameFor(req.run_id, req.phase, attempt);
    const handle = yield* herdr.startPiPhase({
      agentName,
      argv: buildPiArgv(req),
      cwd: workspace.path,
      workspaceId: workspace.workspaceId,
    });

    const agentStatus = yield* herdr.waitAgentTerminal(handle.target, {
      timeoutMs,
    });
    const status = mapAgentStatus(agentStatus);
    const summary = yield* herdr.readAgentSummary(handle.target);

    const completed = buildPhaseCompleted({
      attempt,
      phase: req.phase,
      project_id: req.project_id,
      repo: req.repo,
      run_id: req.run_id,
      status,
      ticket_id: req.ticket_id,
      ...(req.kind === undefined ? {} : { kind: req.kind }),
      ...(summary === undefined ? {} : { summary }),
      ...(req.context.refs === undefined ? {} : { refs: req.context.refs }),
    });

    yield* sender.send(completed);
    return completed;
  });

/**
 * Accept path: ensure workspace exists, return 202 payload.
 * Caller may fork `runPhase` for babysitting (control HTTP does this).
 */
export const startPhase = (
  req: StartPhaseRequest
): Effect.Effect<StartPhaseAccepted, Error, HerdrPort> =>
  Effect.gen(function* startPhaseGen() {
    const herdr = yield* HerdrPort;
    const attempt = resolveAttempt(req);
    const workspace = yield* herdr.ensureRunWorkspace({
      repo: req.repo,
      repoCheckout: repoCheckoutOf(req),
      runId: req.run_id,
    });

    return {
      accepted: true as const,
      attempt,
      phase: req.phase,
      run_id: req.run_id,
      workspace_id: workspace.workspaceId,
    };
  });
