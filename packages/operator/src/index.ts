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
  RepoRef,
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
  RepoRef as RepoRefType,
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

export {
  HttpPhaseCompletionSenderLayer,
  makeHttpPhaseCompletionSender,
  toInngestEnvelope,
} from "./adapters/completion-http.js";
export type {
  HttpPhaseCompletionSenderOptions,
  InngestEventEnvelope,
} from "./adapters/completion-http.js";

export { HerdrCliLayer, makeHerdrCli } from "./adapters/herdr-cli.js";
export type { HerdrCliOptions } from "./adapters/herdr-cli.js";

export {
  isTerminalAgentStatus,
  parseAgentGet,
  parseAgentReadText,
  parseWorkspaceList,
  parseWorktreeList,
  resolveWorkspaceFromHerdrState,
} from "./adapters/herdr-decode.js";
