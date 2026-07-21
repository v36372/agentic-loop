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
import type { ParsedAgentInfo } from "./herdr-decode.js";
import {
  herdrErrorCode,
  HerdrCliTimeoutError,
  isAgentStartConflictMessage,
  isHerdrCliTimeoutError,
  isTerminalAgentStatus,
  parseAgentGet,
  parseAgentReadText,
  parseAgentStarted,
  parseWorktreeCreate,
  parseWorkspaceList,
  parseWorktreeList,
  resolveWorkspaceFromHerdrState,
} from "./herdr-decode.js";

export interface HerdrCliRunOptions {
  /** Remaining wall-clock budget for this CLI invocation, in milliseconds. */
  readonly timeoutMs?: number;
}

export interface HerdrCliOptions {
  readonly herdrBin?: string;
  readonly pollIntervalMs?: number;
  /**
   * Injected CLI runner for fixture tests; production uses `herdr` exec.
   * Must honor `timeoutMs` (fail with HerdrCliTimeoutError / cancel work).
   */
  readonly run?: (
    args: readonly string[],
    options?: HerdrCliRunOptions
  ) => Effect.Effect<unknown, Error>;
}

const execFileAsync = promisify(execFile);

const abortedError = (): DOMException =>
  new DOMException("The operation was aborted", "AbortError");

const timeoutError = (
  args: readonly string[],
  timeoutMs: number | undefined,
  cause?: unknown
): HerdrCliTimeoutError =>
  new HerdrCliTimeoutError(
    `herdr ${args.join(" ")} timed out after ${timeoutMs ?? "?"}ms`,
    cause === undefined ? undefined : { cause }
  );

/**
 * Build a cancellable CLI runner that aborts when Effect is interrupted or
 * when `timeoutMs` elapses. Used for production and as a template for fixtures.
 *
 * Deadline aborts become `HerdrCliTimeoutError`. Effect interruption aborts the
 * owned work via the signal and surfaces as interruption (not a typed timeout).
 */
export const makeAbortableRun =
  (
    execute: (args: readonly string[], signal: AbortSignal) => Promise<unknown>
  ): ((
    args: readonly string[],
    options?: HerdrCliRunOptions
  ) => Effect.Effect<unknown, Error>) =>
  (args, options = {}) =>
    Effect.tryPromise({
      catch: (error) => {
        if (isHerdrCliTimeoutError(error)) {
          return error instanceof Error
            ? error
            : new HerdrCliTimeoutError(String(error));
        }
        return error instanceof Error ? error : new Error(String(error));
      },
      try: async (outerSignal) => {
        if (outerSignal.aborted) {
          throw abortedError();
        }
        if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
          throw timeoutError(args, options.timeoutMs);
        }

        const controller = new AbortController();
        let timedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;

        const abortFromOuter = () => {
          controller.abort();
        };
        outerSignal.addEventListener("abort", abortFromOuter, { once: true });

        try {
          if (options.timeoutMs !== undefined) {
            timeoutHandle = setTimeout(() => {
              timedOut = true;
              controller.abort();
            }, options.timeoutMs);
          }

          try {
            const value = await execute(args, controller.signal);
            if (timedOut) {
              throw timeoutError(args, options.timeoutMs);
            }
            if (outerSignal.aborted) {
              throw abortedError();
            }
            return value;
          } catch (error) {
            if (timedOut) {
              throw timeoutError(args, options.timeoutMs, error);
            }
            if (
              outerSignal.aborted ||
              (error instanceof Error && error.name === "AbortError")
            ) {
              throw error instanceof Error ? error : abortedError();
            }
            throw error instanceof Error ? error : new Error(String(error));
          }
        } finally {
          outerSignal.removeEventListener("abort", abortFromOuter);
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        }
      },
    });

/**
 * Default Herdr CLI runner: exec `herdr <args...>` and parse JSON stdout.
 * Empty stdout becomes `null`. Non-JSON stdout fails closed.
 * Applies remaining deadline via AbortSignal + kill on timeout/interrupt.
 */
const defaultRun = (herdrBin: string) =>
  makeAbortableRun(async (args, signal) => {
    const { stdout } = await execFileAsync(herdrBin, [...args], {
      encoding: "utf-8",
      killSignal: "SIGKILL",
      signal,
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

const remainingMs = (deadline: number): number =>
  Math.max(0, deadline - Date.now());

const handleFromAgent = (
  agent: ParsedAgentInfo,
  expectedName: string,
  expectedWorkspaceId: string,
  reattached: boolean
): HerdrAgentHandle => {
  if (!agent.terminalId) {
    throw new Error(
      `herdr agent ${expectedName} missing terminal_id after decode`
    );
  }
  if (agent.workspaceId !== expectedWorkspaceId) {
    throw new Error(
      `agent ${expectedName} belongs to workspace ${agent.workspaceId}, expected ${expectedWorkspaceId}`
    );
  }
  // Prefer Herdr-assigned name when present; fall back to requested name.
  const agentName = agent.agentName ?? expectedName;
  return {
    agentName,
    reattached,
    target: agent.terminalId,
    workspaceId: agent.workspaceId,
  };
};

/**
 * Live Herdr CLI adapter (fail-closed).
 * Unit tests inject `run` with fixture envelopes — no live Herdr required in CI.
 *
 * Contracts:
 * - never fabricates workspace paths or `ws-${runId}` IDs
 * - create path must equal expectedRunPath and re-list must confirm binding
 * - find-or-start proves agent via schema-decoded name/workspace/terminal_id
 * - waits/reads use terminal_id as the stable target
 * - wait timeout bounds each CLI invocation and cancels owned subprocess work
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

  /**
   * Accept a create/query workspace only when path equals expectedRunPath and
   * a re-list confirms the path/workspace binding (fail closed otherwise).
   */
  const verifyAndCacheWorkspace = (
    input: EnsureRunWorkspaceInput,
    candidate: { path: string; workspaceId: string }
  ): Effect.Effect<HerdrWorkspace, Error> =>
    Effect.gen(function* verifyWorkspace() {
      const expectedPath = expectedRunPath(input.repoCheckout, input.runId);
      if (candidate.path !== expectedPath) {
        return yield* Effect.fail(
          new Error(
            `herdr workspace path ${candidate.path} does not match expected ${expectedPath}`
          )
        );
      }
      if (!candidate.workspaceId) {
        return yield* Effect.fail(
          new Error("herdr workspace missing workspace_id")
        );
      }

      const confirmed = yield* queryWorkspace(input);
      if (!confirmed) {
        return yield* Effect.fail(
          new Error(
            `herdr did not list path/workspace binding for run ${input.runId} after create`
          )
        );
      }
      if (
        confirmed.path !== expectedPath ||
        confirmed.workspaceId !== candidate.workspaceId
      ) {
        return yield* Effect.fail(
          new Error(
            `herdr listed binding path=${confirmed.path} workspace=${confirmed.workspaceId}; expected path=${expectedPath} workspace=${candidate.workspaceId}`
          )
        );
      }
      assertWorkspaceMatches(confirmed, input);
      cache.set(input.runId, confirmed);
      return confirmed;
    });

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

      let parsed: { path: string; workspaceId: string };
      try {
        parsed = parseWorktreeCreate(createdOrError.success);
      } catch (error) {
        // Malformed create envelope: re-query once in case Herdr did create.
        const afterBadCreate = yield* queryWorkspace(input);
        if (afterBadCreate) {
          assertWorkspaceMatches(afterBadCreate, input);
          cache.set(input.runId, afterBadCreate);
          return afterBadCreate;
        }
        return yield* Effect.fail(
          error instanceof Error ? error : new Error(String(error))
        );
      }

      return yield* verifyAndCacheWorkspace(input, parsed);
    });

  /**
   * Look up an agent by name and prove workspace + terminal_id.
   * Returns `undefined` for agent_not_found (exit 0/1 envelope or process error).
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

      let got: ParsedAgentInfo;
      try {
        got = parseAgentGet(envelope);
      } catch (error) {
        return yield* Effect.fail(
          error instanceof Error ? error : new Error(String(error))
        );
      }

      try {
        return handleFromAgent(got, agentName, workspaceId, true);
      } catch (error) {
        return yield* Effect.fail(
          error instanceof Error ? error : new Error(String(error))
        );
      }
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

      if (Result.isSuccess(startResult)) {
        const startCode = herdrErrorCode(startResult.success);
        if (!startCode) {
          let started: ParsedAgentInfo;
          try {
            started = parseAgentStarted(startResult.success);
          } catch (error) {
            return yield* Effect.fail(
              error instanceof Error ? error : new Error(String(error))
            );
          }
          try {
            return handleFromAgent(
              started,
              input.agentName,
              input.workspaceId,
              false
            );
          } catch (error) {
            return yield* Effect.fail(
              error instanceof Error ? error : new Error(String(error))
            );
          }
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
      while (true) {
        const budget = remainingMs(deadline);
        if (budget <= 0) {
          return "timed_out" as const;
        }

        const gotOrError = yield* run(["agent", "get", target], {
          timeoutMs: budget,
        }).pipe(Effect.result);

        if (Result.isFailure(gotOrError)) {
          if (isHerdrCliTimeoutError(gotOrError.failure)) {
            return "timed_out" as const;
          }
          return yield* Effect.fail(
            gotOrError.failure instanceof Error
              ? gotOrError.failure
              : new Error(String(gotOrError.failure))
          );
        }

        const got = gotOrError.success;
        const code = herdrErrorCode(got);
        if (code) {
          return yield* Effect.fail(
            new Error(
              `herdr agent get while waiting failed: ${JSON.stringify(got)}`
            )
          );
        }

        let parsed: ParsedAgentInfo;
        try {
          parsed = parseAgentGet(got);
        } catch (error) {
          return yield* Effect.fail(
            error instanceof Error ? error : new Error(String(error))
          );
        }

        if (isTerminalAgentStatus(parsed.status)) {
          return parsed.status;
        }

        const sleepBudget = Math.min(pollIntervalMs, remainingMs(deadline));
        if (sleepBudget <= 0) {
          return "timed_out" as const;
        }
        yield* Effect.promise(() => delay(sleepBudget));
      }
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
