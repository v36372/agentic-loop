import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { makeHerdrCli } from "./herdr-cli.js";
import {
  parseAgentGet,
  parseAgentReadText,
  resolveWorkspaceFromHerdrState,
} from "./herdr-decode.js";

const workspaceList = {
  id: "cli:workspace:list",
  result: {
    type: "workspace_list",
    workspaces: [
      {
        label: "run-9",
        workspace_id: "w9",
      },
    ],
  },
};

const worktreeList = {
  id: "cli:worktree:list",
  result: {
    type: "worktree_list",
    worktrees: [
      {
        label: "agentic-loop",
        open_workspace_id: "w9",
        path: "/tmp/agentic-loop-runs/run-9",
      },
    ],
  },
};

const agentGet = (status: string) => ({
  id: "cli:agent:get",
  result: {
    agent: {
      agent: "pi",
      agent_status: status,
      cwd: "/tmp/agentic-loop-runs/run-9",
      workspace_id: "w9",
    },
  },
});

const agentNotFound = {
  error: { code: "agent_not_found", message: "agent target missing" },
  id: "cli:agent:get",
};

const agentRead = {
  id: "cli:agent:read",
  result: {
    read: {
      text: "phase summary text",
    },
  },
};

describe("herdr-decode", () => {
  it("resolves workspace from path + open_workspace_id without empty path", () => {
    const ws = resolveWorkspaceFromHerdrState({
      expectedPath: "/tmp/agentic-loop-runs/run-9",
      repo: "v36372/agentic-loop",
      runId: "run-9",
      workspaces: [{ label: "run-9", workspaceId: "w9" }],
      worktrees: [
        {
          openWorkspaceId: "w9",
          path: "/tmp/agentic-loop-runs/run-9",
        },
      ],
    });
    expect(ws).toStrictEqual({
      path: "/tmp/agentic-loop-runs/run-9",
      repo: "v36372/agentic-loop",
      runId: "run-9",
      workspaceId: "w9",
    });
  });

  it("decodes agent status from result.agent.agent_status", () => {
    expect(parseAgentGet(agentGet("blocked")).status).toBe("blocked");
    expect(parseAgentGet(agentGet("idle")).status).toBe("idle");
  });

  it("decodes summary from result.read.text", () => {
    expect(parseAgentReadText(agentRead)).toBe("phase summary text");
  });

  it("fails closed on malformed agent get envelopes", () => {
    expect(() => parseAgentGet({ id: "x", result: {} })).toThrow(
      /decode failed/u
    );
  });
});

describe(makeHerdrCli, () => {
  it("reattaches workspace from Herdr list state with real path", async () => {
    const calls: string[][] = [];
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          calls.push([...args]);
          if (args[0] === "workspace" && args[1] === "list") {
            return workspaceList;
          }
          if (args[0] === "worktree" && args[1] === "list") {
            return worktreeList;
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    const workspace = await Effect.runPromise(
      herdr.ensureRunWorkspace({
        repo: "v36372/agentic-loop",
        repoCheckout: "/tmp/agentic-loop",
        runId: "run-9",
      })
    );

    expect(workspace.workspaceId).toBe("w9");
    expect(workspace.path).toBe("/tmp/agentic-loop-runs/run-9");
    expect(
      calls.some((c) => c[0] === "worktree" && c[1] === "create")
    ).toBeFalsy();
  });

  it("fails closed when workspace list cannot be decoded", async () => {
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "workspace") {
            return { broken: true };
          }
          return worktreeList;
        }),
    });

    await expect(
      Effect.runPromise(
        herdr.ensureRunWorkspace({
          repo: "v36372/agentic-loop",
          repoCheckout: "/tmp/agentic-loop",
          runId: "run-9",
        })
      )
    ).rejects.toThrow(/decode failed/u);
  });

  it("re-queries on create conflict instead of inventing workspace ids", async () => {
    let createCalls = 0;
    const herdr = makeHerdrCli({
      run: (args) => {
        if (args[0] === "workspace" && args[1] === "list") {
          return Effect.succeed(
            createCalls === 0
              ? {
                  id: "cli:workspace:list",
                  result: { type: "workspace_list", workspaces: [] },
                }
              : workspaceList
          );
        }
        if (args[0] === "worktree" && args[1] === "list") {
          return Effect.succeed(
            createCalls === 0
              ? {
                  id: "cli:worktree:list",
                  result: { type: "worktree_list", worktrees: [] },
                }
              : worktreeList
          );
        }
        if (args[0] === "worktree" && args[1] === "create") {
          createCalls += 1;
          return Effect.fail(new Error("already exists"));
        }
        return Effect.fail(new Error(`unexpected ${args.join(" ")}`));
      },
    });

    const workspace = await Effect.runPromise(
      herdr.ensureRunWorkspace({
        repo: "v36372/agentic-loop",
        repoCheckout: "/tmp/agentic-loop",
        runId: "run-9",
      })
    );
    expect(createCalls).toBe(1);
    expect(workspace.workspaceId).toBe("w9");
    expect(workspace.path).toBe("/tmp/agentic-loop-runs/run-9");
  });

  it("reattaches an existing agent and does not start a second one", async () => {
    let startCalls = 0;
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            return agentGet("working");
          }
          if (args[0] === "agent" && args[1] === "start") {
            startCalls += 1;
            return { id: "cli:agent:start", result: {} };
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    const handle = await Effect.runPromise(
      herdr.startPiPhase({
        agentName: "run-9-explore-1",
        argv: ["pi", "-p", "hi"],
        cwd: "/tmp/agentic-loop-runs/run-9",
        workspaceId: "w9",
      })
    );
    expect(handle.reattached).toBeTruthy();
    expect(startCalls).toBe(0);
  });

  it("starts only when agent get reports not found", async () => {
    let startCalls = 0;
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            return agentNotFound;
          }
          if (args[0] === "agent" && args[1] === "start") {
            startCalls += 1;
            return { id: "cli:agent:start", result: {} };
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    const handle = await Effect.runPromise(
      herdr.startPiPhase({
        agentName: "run-9-explore-1",
        argv: ["pi", "-p", "hi"],
        cwd: "/tmp/agentic-loop-runs/run-9",
        workspaceId: "w9",
      })
    );
    expect(handle.reattached).toBeFalsy();
    expect(startCalls).toBe(1);
  });

  it("maps blocked agent get to blocked without waiting only for idle", async () => {
    const herdr = makeHerdrCli({
      pollIntervalMs: 1,
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            return agentGet("blocked");
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });
    const status = await Effect.runPromise(
      herdr.waitAgentTerminal("run-9-explore-1", { timeoutMs: 100 })
    );
    expect(status).toBe("blocked");
  });

  it("returns timed_out when agent stays working past deadline", async () => {
    const herdr = makeHerdrCli({
      pollIntervalMs: 5,
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            return agentGet("working");
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });
    const status = await Effect.runPromise(
      herdr.waitAgentTerminal("run-9-explore-1", { timeoutMs: 20 })
    );
    expect(status).toBe("timed_out");
  });

  it("fails closed on malformed agent status while waiting", async () => {
    const herdr = makeHerdrCli({
      run: () => Effect.succeed({ id: "cli:agent:get", result: { agent: {} } }),
    });
    await expect(
      Effect.runPromise(
        herdr.waitAgentTerminal("run-9-explore-1", { timeoutMs: 10 })
      )
    ).rejects.toThrow(/decode failed/u);
  });

  it("reads summary from result.read.text", async () => {
    const herdr = makeHerdrCli({
      run: () => Effect.succeed(agentRead),
    });
    const summary = await Effect.runPromise(
      herdr.readAgentSummary("run-9-explore-1")
    );
    expect(summary).toBe("phase summary text");
  });
});
