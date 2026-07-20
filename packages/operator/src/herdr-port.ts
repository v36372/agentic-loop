import { Context } from "effect";
import type { Effect, Option } from "effect";

/** Terminal / poll statuses returned by HerdrPort.waitAgentTerminal. */
export type AgentTerminalStatus =
  | "blocked"
  | "done"
  | "idle"
  | "timed_out"
  | "unknown"
  | "working";

export interface HerdrWorkspace {
  readonly path: string;
  readonly repo: string;
  readonly runId: string;
  readonly workspaceId: string;
}

export interface HerdrAgentHandle {
  readonly agentName: string;
  readonly reattached: boolean;
  readonly target: string;
  readonly workspaceId: string;
}

export interface EnsureRunWorkspaceInput {
  readonly branchHint?: string;
  readonly repo: string;
  readonly repoCheckout: string;
  readonly runId: string;
}

export interface StartPiPhaseInput {
  readonly agentName: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly workspaceId: string;
}

export interface WaitAgentTerminalOptions {
  readonly timeoutMs: number;
}

export interface HerdrPortShape {
  readonly ensureRunWorkspace: (
    input: EnsureRunWorkspaceInput
  ) => Effect.Effect<HerdrWorkspace, Error>;
  readonly findWorkspaceByRunId: (
    runId: string
  ) => Effect.Effect<Option.Option<HerdrWorkspace>, Error>;
  readonly readAgentSummary: (
    target: string
  ) => Effect.Effect<string | undefined, Error>;
  /**
   * Find-or-start pi for this phase attempt.
   * If an agent with the same name already exists, reattach (do not spawn).
   */
  readonly startPiPhase: (
    input: StartPiPhaseInput
  ) => Effect.Effect<HerdrAgentHandle, Error>;
  readonly waitAgentTerminal: (
    target: string,
    opts: WaitAgentTerminalOptions
  ) => Effect.Effect<AgentTerminalStatus, Error>;
}

/** Only operator drives Herdr; workflows/control depend on this port. */
export class HerdrPort extends Context.Service<HerdrPort, HerdrPortShape>()(
  "HerdrPort"
) {}
