import { Schema } from "effect";

/** Work phases driven by the operator bridge (rework = implement + attempt > 1). */
export const WorkPhase = Schema.Literals(["explore", "implement", "review"]);
export type WorkPhase = typeof WorkPhase.Type;

export const TicketKind = Schema.Literals(["impl", "research"]);
export type TicketKind = typeof TicketKind.Type;

export const PhaseTerminalStatus = Schema.Literals([
  "blocked",
  "cancelled",
  "failed",
  "succeeded",
]);
export type PhaseTerminalStatus = typeof PhaseTerminalStatus.Type;

export const Attempt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
export type Attempt = typeof Attempt.Type;

/** Non-empty identity string for ticket/project/actor correlation fields. */
export const IdentityString = Schema.NonEmptyString;
export type IdentityString = typeof IdentityString.Type;

/**
 * Safe run identity used as a filesystem path segment and agent name token.
 * Rejects path traversal, separators, whitespace, bare `.`/`..`, and overlong values.
 */
export const RunId = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/u),
  Schema.isMaxLength(63)
);
export type RunId = typeof RunId.Type;

/** GitHub-style owner/name repo identity. */
export const RepoRef = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u)
);
export type RepoRef = typeof RepoRef.Type;

export const PhaseContext = Schema.Struct({
  issue_url: Schema.optionalKey(Schema.NonEmptyString),
  prompt: Schema.optionalKey(Schema.NonEmptyString),
  refs: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  repo_checkout: Schema.optionalKey(Schema.NonEmptyString),
});
export type PhaseContext = typeof PhaseContext.Type;

export const StartPhaseRequest = Schema.Struct({
  actor: Schema.optionalKey(IdentityString),
  attempt: Schema.optionalKey(Attempt),
  context: PhaseContext,
  kind: Schema.optionalKey(TicketKind),
  phase: WorkPhase,
  project_id: IdentityString,
  repo: RepoRef,
  run_id: RunId,
  ticket_id: IdentityString,
});
export type StartPhaseRequest = typeof StartPhaseRequest.Type;

export const StartPhaseAccepted = Schema.Struct({
  accepted: Schema.Literal(true),
  attempt: Attempt,
  phase: WorkPhase,
  run_id: RunId,
  workspace_id: Schema.optionalKey(IdentityString),
});
export type StartPhaseAccepted = typeof StartPhaseAccepted.Type;

export const PhaseCompletedEventName = Schema.Literal("herdr/phase.completed");
export type PhaseCompletedEventName = typeof PhaseCompletedEventName.Type;

const PhaseCompletedEventFields = Schema.Struct({
  actor: IdentityString,
  attempt: Attempt,
  idempotency_key: IdentityString,
  kind: Schema.optionalKey(TicketKind),
  name: PhaseCompletedEventName,
  phase: WorkPhase,
  project_id: IdentityString,
  refs: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  repo: RepoRef,
  run_id: RunId,
  status: PhaseTerminalStatus,
  summary: Schema.optionalKey(Schema.String),
  ticket_id: IdentityString,
});

/** Completion event whose idempotency_key must match run/phase/attempt/status. */
export const PhaseCompletedEvent = PhaseCompletedEventFields.check(
  Schema.makeFilter((event: typeof PhaseCompletedEventFields.Type) => {
    const expected = `${event.run_id}:${event.phase}:${event.attempt}:${event.status}`;
    return event.idempotency_key === expected
      ? undefined
      : `idempotency_key must equal ${expected}`;
  })
);
export type PhaseCompletedEvent = typeof PhaseCompletedEvent.Type;

export const decodeStartPhaseRequest =
  Schema.decodeUnknownEffect(StartPhaseRequest);
export const decodePhaseCompletedEvent =
  Schema.decodeUnknownEffect(PhaseCompletedEvent);
export const decodeStartPhaseRequestSync =
  Schema.decodeUnknownSync(StartPhaseRequest);
export const decodePhaseCompletedEventSync =
  Schema.decodeUnknownSync(PhaseCompletedEvent);
