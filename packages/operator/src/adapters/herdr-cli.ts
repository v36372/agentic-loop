import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { Effect, Layer, Option } from "effect";

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
  readonly run?: (args: readonly string[]) => Effect.Effect<unknown, Error>;
}

const execFileAsync = promisify(execFile);

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

/**
 * Live Herdr CLI adapter (fail-closed).
 * Unit tests inject `run` with fixture envelopes — no live Herdr required.
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
        repo: input.repo,
        runId: input.runId,
        workspaces,
        worktrees,
      });
    });

  const findWorkspaceByRunId = (runId: string) =>
    Effect.sync(() => Option.fromNullishOr(cache.get(runId)));

  const ensureRunWorkspace = (input: EnsureRunWorkspaceInput) =>
    Effect.gen(function* ensureWorkspace() {
      const cached = cache.get(input.runId);
      if (cached) {
        return cached;
      }

      const existing = yield* queryWorkspace(input);
      if (existing) {
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

      if (createdOrError._tag === "Failure") {
        const raced = yield* queryWorkspace(input);
        if (raced) {
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
        const workspace: HerdrWorkspace = {
          path: parsed.path,
          repo: input.repo,
          runId: input.runId,
          workspaceId: parsed.workspaceId,
        };
        cache.set(input.runId, workspace);
        return workspace;
      }

      const afterCreate = yield* queryWorkspace(input);
      if (afterCreate) {
        cache.set(input.runId, afterCreate);
        return afterCreate;
      }
      return yield* Effect.fail(
        new Error(
          `herdr worktree create for run ${input.runId} returned no workspace id/path`
        )
      );
    });

  const findExistingAgent = (
    agentName: string,
    workspaceId: string
  ): Effect.Effect<HerdrAgentHandle | undefined, Error> =>
    Effect.gen(function* findAgent() {
      const getResult = yield* run(["agent", "get", agentName]).pipe(
        Effect.result
      );
      if (getResult._tag === "Failure") {
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
      if (
        envelope &&
        typeof envelope === "object" &&
        "error" in envelope &&
        envelope.error
      ) {
        const code = (envelope as { error?: { code?: string } }).error?.code;
        if (code === "agent_not_found") {
          return;
        }
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

      yield* run([
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
      ]);

      return {
        agentName: input.agentName,
        reattached: false,
        target: input.agentName,
        workspaceId: input.workspaceId,
      };
    });

  const waitAgentTerminal = (target: string, opts: WaitAgentTerminalOptions) =>
    Effect.gen(function* waitAgent() {
      const deadline = Date.now() + opts.timeoutMs;
      while (Date.now() <= deadline) {
        const got = yield* run(["agent", "get", target]);
        if (
          got &&
          typeof got === "object" &&
          "error" in got &&
          (got as { error?: unknown }).error
        ) {
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

export const HerdrCliLayer = (
  options: HerdrCliOptions = {}
): Layer.Layer<HerdrPort> => Layer.succeed(HerdrPort, makeHerdrCli(options));
