export {
  agentNameFor,
  buildPhaseCompleted,
  expectedRunPath,
  idempotencyKey,
  mapAgentStatus,
  OPERATOR_ACTOR,
  resolveAttempt,
} from "./idempotency.js";
export type { BuildPhaseCompletedInput } from "./idempotency.js";

export {
  formatRunIdentity,
  isRunIdentityConflictError,
  RunIdentityConflictError,
  runIdentitiesEqual,
  runIdentityFromCompletion,
  runIdentityFromRequest,
} from "./identity.js";
export type { RunIdentity } from "./identity.js";

export { DEFAULT_AGENT_TIMEOUT_MS, runPhase, startPhase } from "./phase.js";
export type { PhaseDeps, RunPhaseOptions } from "./phase.js";

export {
  HerdrPort,
  type AgentTerminalStatus,
  type EnsureRunWorkspaceInput,
  type HerdrAgentHandle,
  type HerdrPortShape,
  type HerdrWorkspace,
  type StartPiPhaseInput,
  type WaitAgentTerminalOptions,
} from "./herdr-port.js";
export {
  PhaseCompletionSender,
  type PhaseCompletionSenderShape,
} from "./completion-port.js";

export { buildPiArgv } from "./prompts.js";

export {
  Attempt,
  decodePhaseCompletedEvent,
  decodePhaseCompletedEventSync,
  decodeStartPhaseRequest,
  decodeStartPhaseRequestSync,
  IdentityString,
  PhaseCompletedEvent,
  PhaseCompletedEventName,
  PhaseContext,
  PhaseTerminalStatus,
  RepoName,
  RepoOwner,
  RepoRef,
  RunId,
  StartPhaseAccepted,
  StartPhaseRequest,
  TicketKind,
  WorkPhase,
} from "./schema.js";
export type {
  Attempt as AttemptType,
  IdentityString as IdentityStringType,
  PhaseCompletedEvent as PhaseCompletedEventType,
  PhaseContext as PhaseContextType,
  PhaseTerminalStatus as PhaseTerminalStatusType,
  RepoName as RepoNameType,
  RepoOwner as RepoOwnerType,
  RepoRef as RepoRefType,
  RunId as RunIdType,
  StartPhaseAccepted as StartPhaseAcceptedType,
  StartPhaseRequest as StartPhaseRequestType,
  TicketKind as TicketKindType,
  WorkPhase as WorkPhaseType,
} from "./schema.js";

export {
  createInMemoryHerdrState,
  InMemoryHerdrLayer,
  makeInMemoryHerdr,
} from "./adapters/herdr-memory.js";
export type {
  InMemoryHerdrOptions,
  InMemoryHerdrState,
} from "./adapters/herdr-memory.js";

export {
  createRecordingSenderState,
  makeRecordingPhaseCompletionSender,
  RecordingPhaseCompletionSenderLayer,
} from "./adapters/completion-recording.js";
export type { RecordingPhaseCompletionState } from "./adapters/completion-recording.js";
