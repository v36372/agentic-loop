import type { AgentTerminalStatus } from "./herdr-port.js";
import type {
  Attempt,
  PhaseCompletedEvent,
  PhaseTerminalStatus,
  StartPhaseRequest,
  TicketKind,
  WorkPhase,
} from "./schema.js";

export const OPERATOR_ACTOR = "operator" as const;

/** Deterministic agent name for a run/phase/attempt triple. */
export const agentNameFor = (
  runId: string,
  phase: WorkPhase,
  attempt: Attempt
): string => `${runId}-${phase}-${attempt}`;

/** Stable completion key used for de-duplication. */
export const idempotencyKey = (
  runId: string,
  phase: WorkPhase,
  attempt: Attempt,
  status: PhaseTerminalStatus
): string => `${runId}:${phase}:${attempt}:${status}`;

export interface BuildPhaseCompletedInput {
  readonly attempt: Attempt;
  readonly actor?: string;
  readonly kind?: TicketKind;
  readonly phase: WorkPhase;
  readonly project_id: string;
  readonly refs?: Readonly<Record<string, string>>;
  readonly repo: string;
  readonly run_id: string;
  readonly status: PhaseTerminalStatus;
  readonly summary?: string;
  readonly ticket_id: string;
}

/** Pure builder for herdr/phase.completed (no I/O). */
export const buildPhaseCompleted = (
  input: BuildPhaseCompletedInput
): PhaseCompletedEvent => {
  const event: PhaseCompletedEvent = {
    actor: input.actor ?? OPERATOR_ACTOR,
    attempt: input.attempt,
    idempotency_key: idempotencyKey(
      input.run_id,
      input.phase,
      input.attempt,
      input.status
    ),
    name: "herdr/phase.completed",
    phase: input.phase,
    project_id: input.project_id,
    repo: input.repo,
    run_id: input.run_id,
    status: input.status,
    ticket_id: input.ticket_id,
  };

  if (input.kind !== undefined) {
    Object.assign(event, { kind: input.kind });
  }
  if (input.summary !== undefined) {
    Object.assign(event, { summary: input.summary });
  }
  if (input.refs !== undefined) {
    Object.assign(event, { refs: input.refs });
  }

  return event;
};

/** Default attempt is 1 when the request omits it. */
export const resolveAttempt = (req: StartPhaseRequest): Attempt =>
  req.attempt ?? 1;

/**
 * Map Herdr terminal statuses to phase outcomes.
 * Success only for idle/done (explicit agent terminal success states).
 * working is not terminal and must not reach this mapper from wait.
 */
export const mapAgentStatus = (
  status: AgentTerminalStatus
): PhaseTerminalStatus => {
  switch (status) {
    case "idle":
    case "done": {
      return "succeeded";
    }
    case "blocked": {
      return "blocked";
    }
    case "timed_out":
    case "unknown":
    case "working": {
      return "failed";
    }
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
};

/** Deterministic worktree path for a run under a repo checkout root. */
export const expectedRunPath = (repoCheckout: string, runId: string): string =>
  `${repoCheckout.replace(/\/$/u, "")}-runs/${runId}`;
