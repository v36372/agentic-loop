import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { Effect, Layer, Option, Result } from "effect";

import { HerdrPort } from "../herdr-port.js";
import type {
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
import {
  herdrErrorCode,
  isAgentStartConflictMessage,
  isTerminalAgentStatus,
  parseAgentGet,
  parseAgentReadText,
  parseWorktreeCreate,
  parseWorkspaceList,
  parseWorktreeList,
  resolveWorkspaceFromHerdrState,
} from "./herdr-decode.js";

export interface HerdrCliOptions {
  readonly herdrBin?: string;
  readonly pollIntervalMs?: number;
  /** Injected CLI runner for fixture tests; production uses `herdr` exec. */
  readonly run?: (args: readonly string[]) => Effect.Effect<unknown, Error>;
}

const execFileAsync = promisify(execFile);

/**
 * Default Herdr CLI runner: exec `herdr <args...>` and parse JSON stdout.
 * Empty stdout becomes `null`. Non-JSON stdout fails closed.
 */
const defaultRun =
  (herdrBin: string) =>
  (args: readonly string[]): Effect.Effect<unknown, Error> =>
    Effect.tryPromise({
      catch: (error) => new Error(String(error)),
      try: async () => {
        const { stdout } = await execFileAsync(herdrBin, [...args], {
          encoding: "utf-8",
        });
        const text = String(stdout).trim();
        if (text.length === 0) {
          return null;
        }
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new Error(
            `herdr ${args.join(" ")} returned non-JSON stdout: ${text.slice(0, 200)}`
          );
        }
      },
    });

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

const toWorkspace = (
  input: EnsureRunWorkspaceInput,
  path: string,
  workspaceId: string
): HerdrWorkspace => ({
  path,
  projectId: input.projectId,
  repo: input.repo,
  runId: input.runId,
  ticketId: input.ticketId,
  workspaceId,
  ...(input.kind === undefined ? {} : { kind: input.kind }),
});

/**
 * Live Herdr CLI adapter (fail-closed).
 * Unit tests inject `run` with fixture envelopes — no live Herdr required in CI.
 *
 * Contracts:
 * - never fabricates workspace paths or `ws-${runId}` IDs
 * - find-or-start reattaches existing agents; start conflicts re-query and attach
 * - wait maps idle/done/blocked/unknown/timeout and fails on malformed envelopes
 */
export const makeHerdrCli = (options: HerdrCliOptions = {}): HerdrPortShape => {
  const herdrBin = options.herdrBin ?? "herdr";
  const run = options.run ?? defaultRun(herdrBin);
  const pollIntervalMs = options.pollIntervalMs ?? 50;
  const cache = new Map<string, HerdrWorkspace>();

  const queryWorkspace = (
    input: EnsureRunWorkspaceInput
  ): Effect.Effect<HerdrWorkspace | undefined, Error> =>
    Effect.gen(function* queryWorkspaceGen() {
      const listedWorkspaces = yield* run(["workspace", "list"]);
      const listedWorktrees = yield* run([
        "worktree",
        "list",
        "--json",
        "--cwd",
        input.repoCheckout,
      ]);
      const workspaces = parseWorkspaceList(listedWorkspaces);
      const worktrees = parseWorktreeList(listedWorktrees);
      return resolveWorkspaceFromHerdrState({
        expectedPath: expectedRunPath(input.repoCheckout, input.runId),
        projectId: input.projectId,
        repo: input.repo,
        runId: input.runId,
        ticketId: input.ticketId,
        workspaces,
        worktrees,
        ...(input.kind === undefined ? {} : { kind: input.kind }),
      });
    });

  const findWorkspaceByRunId = (runId: string) =>
    Effect.sync(() => Option.fromNullishOr(cache.get(runId)));

  const ensureRunWorkspace = (input: EnsureRunWorkspaceInput) =>
    Effect.gen(function* ensureWorkspace() {
      const cached = cache.get(input.runId);
      if (cached) {
        assertWorkspaceMatches(cached, input);
        return cached;
      }

      const existing = yield* queryWorkspace(input);
      if (existing) {
        assertWorkspaceMatches(existing, input);
        cache.set(input.runId, existing);
        return existing;
      }

      const path = expectedRunPath(input.repoCheckout, input.runId);
      const branch = input.branchHint ?? `run/${input.runId}`;
      const createdOrError = yield* run([
        "worktree",
        "create",
        "--cwd",
        input.repoCheckout,
        "--branch",
        branch,
        "--path",
        path,
        "--label",
        input.runId,
        "--no-focus",
        "--json",
      ]).pipe(Effect.result);

      if (Result.isFailure(createdOrError)) {
        const raced = yield* queryWorkspace(input);
        if (raced) {
          assertWorkspaceMatches(raced, input);
          cache.set(input.runId, raced);
          return raced;
        }
        return yield* Effect.fail(
          new Error(
            `herdr worktree create failed for run ${input.runId}: ${String(createdOrError.failure)}`
          )
        );
      }

      const parsed = parseWorktreeCreate(createdOrError.success);
      if (parsed.workspaceId && parsed.path) {
        const workspace = toWorkspace(input, parsed.path, parsed.workspaceId);
        cache.set(input.runId, workspace);
        return workspace;
      }

      const afterCreate = yield* queryWorkspace(input);
      if (afterCreate) {
        assertWorkspaceMatches(afterCreate, input);
        cache.set(input.runId, afterCreate);
        return afterCreate;
      }
      return yield* Effect.fail(
        new Error(
          `herdr worktree create for run ${input.runId} returned no workspace id/path`
        )
      );
    });

  /**
   * Look up an agent by name.
   * Returns `undefined` for agent_not_found (exit 0 envelope or process error).
   */
  const findExistingAgent = (
    agentName: string,
    workspaceId: string
  ): Effect.Effect<HerdrAgentHandle | undefined, Error> =>
    Effect.gen(function* findAgent() {
      const getResult = yield* run(["agent", "get", agentName]).pipe(
        Effect.result
      );
      if (Result.isFailure(getResult)) {
        const message = String(getResult.failure);
        if (/agent_not_found|not found/iu.test(message)) {
          return;
        }
        return yield* Effect.fail(
          getResult.failure instanceof Error
            ? getResult.failure
            : new Error(String(getResult.failure))
        );
      }

      // CLI may return error envelope with exit 0 — check envelope.
      const envelope = getResult.success;
      const code = herdrErrorCode(envelope);
      if (code === "agent_not_found") {
        return;
      }
      if (code) {
        return yield* Effect.fail(
          new Error(`herdr agent get failed: ${JSON.stringify(envelope)}`)
        );
      }

      const got = parseAgentGet(envelope);
      if (got.workspaceId && got.workspaceId !== workspaceId) {
        return yield* Effect.fail(
          new Error(
            `agent ${agentName} belongs to workspace ${got.workspaceId}, expected ${workspaceId}`
          )
        );
      }
      return {
        agentName,
        reattached: true,
        target: agentName,
        workspaceId,
      };
    });

  const startPiPhase = (input: StartPiPhaseInput) =>
    Effect.gen(function* startAgent() {
      if (!input.cwd) {
        return yield* Effect.fail(
          new Error("startPiPhase requires non-empty cwd")
        );
      }
      if (!input.workspaceId) {
        return yield* Effect.fail(
          new Error("startPiPhase requires non-empty workspaceId")
        );
      }

      const existing = yield* findExistingAgent(
        input.agentName,
        input.workspaceId
      );
      if (existing) {
        return existing;
      }

      const startResult = yield* run([
        "agent",
        "start",
        input.agentName,
        "--workspace",
        input.workspaceId,
        "--cwd",
        input.cwd,
        "--no-focus",
        "--",
        ...input.argv,
      ]).pipe(Effect.result);

      const startedHandle = {
        agentName: input.agentName,
        reattached: false as const,
        target: input.agentName,
        workspaceId: input.workspaceId,
      };

      if (Result.isSuccess(startResult)) {
        const startCode = herdrErrorCode(startResult.success);
        if (!startCode) {
          return startedHandle;
        }
        const envelopeText = JSON.stringify(startResult.success);
        if (
          !isAgentStartConflictMessage(startCode) &&
          !isAgentStartConflictMessage(envelopeText)
        ) {
          return yield* Effect.fail(
            new Error(`herdr agent start failed: ${envelopeText}`)
          );
        }
        // Conflict-like exit-0 envelope: re-query below.
      } else {
        const message = String(startResult.failure);
        if (!isAgentStartConflictMessage(message)) {
          return yield* Effect.fail(
            startResult.failure instanceof Error
              ? startResult.failure
              : new Error(message)
          );
        }
        // Process-error conflict: re-query below.
      }

      // Start conflict: re-query and attach to the winner (no blind second spawn).
      const winner = yield* findExistingAgent(
        input.agentName,
        input.workspaceId
      );
      if (winner) {
        return winner;
      }
      return yield* Effect.fail(
        new Error(
          `herdr agent start conflict for ${input.agentName} but agent get found no winner`
        )
      );
    });

  const waitAgentTerminal = (target: string, opts: WaitAgentTerminalOptions) =>
    Effect.gen(function* waitAgent() {
      const deadline = Date.now() + opts.timeoutMs;
      while (Date.now() <= deadline) {
        const got = yield* run(["agent", "get", target]);
        const code = herdrErrorCode(got);
        if (code) {
          return yield* Effect.fail(
            new Error(
              `herdr agent get while waiting failed: ${JSON.stringify(got)}`
            )
          );
        }
        const parsed = parseAgentGet(got);
        if (isTerminalAgentStatus(parsed.status)) {
          return parsed.status;
        }
        if (Date.now() >= deadline) {
          break;
        }
        yield* Effect.promise(() => delay(pollIntervalMs));
      }
      return "timed_out" as const;
    });

  const readAgentSummary = (target: string) =>
    Effect.gen(function* readSummary() {
      const result = yield* run([
        "agent",
        "read",
        target,
        "--source",
        "recent-unwrapped",
        "--lines",
        "40",
      ]);
      return parseAgentReadText(result);
    });

  return {
    ensureRunWorkspace,
    findWorkspaceByRunId,
    readAgentSummary,
    startPiPhase,
    waitAgentTerminal,
  };
};

/** Layer providing the live Herdr CLI port. */
export const HerdrCliLayer = (
  options: HerdrCliOptions = {}
): Layer.Layer<HerdrPort> => Layer.succeed(HerdrPort, makeHerdrCli(options));
