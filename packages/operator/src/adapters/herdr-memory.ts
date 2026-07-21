import { Effect, Layer, Option } from "effect";

import { HerdrPort } from "../herdr-port.js";
import type {
  AgentTerminalStatus,
  EnsureRunWorkspaceInput,
  HerdrAgentHandle,
  HerdrPortShape,
  HerdrWorkspace,
  StartPiPhaseInput,
  WaitAgentTerminalOptions,
} from "../herdr-port.js";
import { expectedRunPath } from "../idempotency.js";
import {
  formatRunIdentity,
  RunIdentityConflictError,
  runIdentitiesEqual,
} from "../identity.js";
import type { RunIdentity } from "../identity.js";

export interface InMemoryHerdrOptions {
  readonly summary?: string;
  readonly terminalByAgent?: Readonly<Record<string, AgentTerminalStatus>>;
  readonly terminalStatus?: AgentTerminalStatus;
}

export interface InMemoryHerdrState {
  readonly agents: Map<string, HerdrAgentHandle>;
  readonly createCountByRunId: Map<string, number>;
  readonly startCountByAgent: Map<string, number>;
  summary: string | undefined;
  readonly terminalByAgent: Map<string, AgentTerminalStatus>;
  terminalStatus: AgentTerminalStatus;
  readonly workspaces: Map<string, HerdrWorkspace>;
}

/** Mutable ledger for in-memory Herdr behavior under test. */
export const createInMemoryHerdrState = (
  options: InMemoryHerdrOptions = {}
): InMemoryHerdrState => ({
  agents: new Map(),
  createCountByRunId: new Map(),
  startCountByAgent: new Map(),
  summary: options.summary,
  terminalByAgent: new Map(Object.entries(options.terminalByAgent ?? {})),
  terminalStatus: options.terminalStatus ?? "idle",
  workspaces: new Map(),
});

const workspaceIdFor = (runId: string): string => `ws-${runId}`;

const identityFromWorkspace = (workspace: HerdrWorkspace): RunIdentity => ({
  project_id: workspace.projectId,
  repo: workspace.repo,
  run_id: workspace.runId,
  ticket_id: workspace.ticketId,
  ...(workspace.kind === undefined ? {} : { kind: workspace.kind }),
});

const identityFromInput = (input: EnsureRunWorkspaceInput): RunIdentity => ({
  project_id: input.projectId,
  repo: input.repo,
  run_id: input.runId,
  ticket_id: input.ticketId,
  ...(input.kind === undefined ? {} : { kind: input.kind }),
});

const assertWorkspaceMatches = (
  existing: HerdrWorkspace,
  input: EnsureRunWorkspaceInput
): void => {
  const existingIdentity = identityFromWorkspace(existing);
  const requestedIdentity = identityFromInput(input);
  if (!runIdentitiesEqual(existingIdentity, requestedIdentity)) {
    throw new RunIdentityConflictError(
      input.runId,
      `existing ${formatRunIdentity(existingIdentity)}; requested ${formatRunIdentity(requestedIdentity)}`
    );
  }

  const expectedPath = expectedRunPath(input.repoCheckout, input.runId);
  if (existing.path !== expectedPath) {
    throw new RunIdentityConflictError(
      input.runId,
      `existing path ${existing.path} does not match expected ${expectedPath}`
    );
  }
};

/** Build a pure in-memory HerdrPort implementation. */
export const makeInMemoryHerdr = (
  state: InMemoryHerdrState = createInMemoryHerdrState()
): HerdrPortShape => {
  const findWorkspaceByRunId = (runId: string) =>
    Effect.sync(() => Option.fromNullishOr(state.workspaces.get(runId)));

  const ensureRunWorkspace = (input: EnsureRunWorkspaceInput) =>
    Effect.try({
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
      try: () => {
        const existing = state.workspaces.get(input.runId);
        if (existing) {
          assertWorkspaceMatches(existing, input);
          return existing;
        }
        const created: HerdrWorkspace = {
          path: expectedRunPath(input.repoCheckout, input.runId),
          projectId: input.projectId,
          repo: input.repo,
          runId: input.runId,
          ticketId: input.ticketId,
          workspaceId: workspaceIdFor(input.runId),
          ...(input.kind === undefined ? {} : { kind: input.kind }),
        };
        state.workspaces.set(input.runId, created);
        state.createCountByRunId.set(
          input.runId,
          (state.createCountByRunId.get(input.runId) ?? 0) + 1
        );
        return created;
      },
    });

  // Mirrors live find-or-start: reattach if agent name already registered.
  const startPiPhase = (input: StartPiPhaseInput) =>
    Effect.gen(function* startOrReattach() {
      if (!input.cwd) {
        return yield* Effect.fail(
          new Error("startPiPhase requires non-empty cwd")
        );
      }
      const existing = state.agents.get(input.agentName);
      if (existing) {
        if (existing.workspaceId !== input.workspaceId) {
          return yield* Effect.fail(
            new Error(
              `agent ${input.agentName} already bound to ${existing.workspaceId}`
            )
          );
        }
        return {
          ...existing,
          reattached: true,
        };
      }
      const handle: HerdrAgentHandle = {
        agentName: input.agentName,
        reattached: false,
        target: input.agentName,
        workspaceId: input.workspaceId,
      };
      state.agents.set(input.agentName, handle);
      state.startCountByAgent.set(
        input.agentName,
        (state.startCountByAgent.get(input.agentName) ?? 0) + 1
      );
      return handle;
    });

  const waitAgentTerminal = (target: string, _opts: WaitAgentTerminalOptions) =>
    Effect.sync(
      () => state.terminalByAgent.get(target) ?? state.terminalStatus
    );

  const readAgentSummary = (_target: string) => Effect.succeed(state.summary);

  return {
    ensureRunWorkspace,
    findWorkspaceByRunId,
    readAgentSummary,
    startPiPhase,
    waitAgentTerminal,
  };
};

/** Layer providing the in-memory Herdr port. */
export const InMemoryHerdrLayer = (
  state: InMemoryHerdrState = createInMemoryHerdrState()
): Layer.Layer<HerdrPort> => Layer.succeed(HerdrPort, makeInMemoryHerdr(state));
