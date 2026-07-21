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

/**
 * GitHub-style owner/org segment.
 * Starts and ends with alphanumeric; hyphens allowed inside; max 39 chars.
 * Rejects `.`, `..`, leading/trailing hyphens, and path-like tokens.
 */
const REPO_OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;

/**
 * GitHub repository-name segment: letters, digits, `.`, `-`, `_`; max 100.
 * Allows punctuation at edges (e.g. `.github`) but rejects bare `.` / `..`.
 */
const REPO_NAME_PATTERN = /^(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/u;

export const RepoOwner = Schema.String.check(
  Schema.isPattern(REPO_OWNER_PATTERN),
  Schema.isMaxLength(39)
);
export type RepoOwner = typeof RepoOwner.Type;

export const RepoName = Schema.String.check(
  Schema.isPattern(REPO_NAME_PATTERN),
  Schema.isMaxLength(100)
);
export type RepoName = typeof RepoName.Type;

/**
 * GitHub-style `owner/name` repository identity derived from the same
 * owner/name segment contracts (not a stricter duplicated regex).
 */
export const RepoRef = Schema.String.check(
  Schema.isMaxLength(140),
  Schema.makeFilter((ref: string) => {
    const parts = ref.split("/");
    if (parts.length !== 2) {
      return "repo must be exactly owner/name";
    }
    const [owner, name] = parts;
    if (owner === undefined || name === undefined) {
      return "repo must be exactly owner/name";
    }
    if (owner.length > 39 || !REPO_OWNER_PATTERN.test(owner)) {
      return "invalid repository owner segment";
    }
    if (name.length > 100 || !REPO_NAME_PATTERN.test(name)) {
      return "invalid repository name segment";
    }
  })
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
