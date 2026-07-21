import type {
  PhaseCompletedEvent,
  StartPhaseRequest,
  TicketKind,
} from "./schema.js";

/** Immutable correlation identity bound to a run on first accept. */
export interface RunIdentity {
  readonly kind?: TicketKind;
  readonly project_id: string;
  readonly repo: string;
  readonly run_id: string;
  readonly ticket_id: string;
}

/** Extract immutable run identity from a start-phase request. */
export const runIdentityFromRequest = (
  req: StartPhaseRequest
): RunIdentity => ({
  project_id: req.project_id,
  repo: req.repo,
  run_id: req.run_id,
  ticket_id: req.ticket_id,
  ...(req.kind === undefined ? {} : { kind: req.kind }),
});

/** Extract immutable run identity from a completion event. */
export const runIdentityFromCompletion = (
  event: PhaseCompletedEvent
): RunIdentity => ({
  project_id: event.project_id,
  repo: event.repo,
  run_id: event.run_id,
  ticket_id: event.ticket_id,
  ...(event.kind === undefined ? {} : { kind: event.kind }),
});

const kindKey = (kind: TicketKind | undefined): string => kind ?? "";

/** True when two identities bind the same immutable correlation fields. */
export const runIdentitiesEqual = (
  left: RunIdentity,
  right: RunIdentity
): boolean =>
  left.run_id === right.run_id &&
  left.ticket_id === right.ticket_id &&
  left.project_id === right.project_id &&
  left.repo === right.repo &&
  kindKey(left.kind) === kindKey(right.kind);

/** Format identity for diagnostics (no secrets; ids only). */
export const formatRunIdentity = (identity: RunIdentity): string =>
  [
    `run_id=${identity.run_id}`,
    `ticket_id=${identity.ticket_id}`,
    `project_id=${identity.project_id}`,
    `repo=${identity.repo}`,
    `kind=${identity.kind ?? "<none>"}`,
  ].join(" ");

/**
 * Rejected when a `run_id` is reused with a different ticket/project/repo/kind,
 * or when an existing workspace path does not match the request checkout.
 */
export class RunIdentityConflictError extends Error {
  readonly _tag = "RunIdentityConflictError" as const;
  readonly detail: string;
  readonly runId: string;

  constructor(runId: string, detail: string) {
    super(`run identity conflict for ${runId}: ${detail}`);
    this.name = "RunIdentityConflictError";
    this.detail = detail;
    this.runId = runId;
  }
}

/** Type guard for {@link RunIdentityConflictError}. */
export const isRunIdentityConflictError = (
  error: unknown
): error is RunIdentityConflictError =>
  error instanceof RunIdentityConflictError ||
  (typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "RunIdentityConflictError");
