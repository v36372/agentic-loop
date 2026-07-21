import { setTimeout as delay } from "node:timers/promises";

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { makeAbortableRun, makeHerdrCli } from "./herdr-cli.js";
import {
  parseAgentGet,
  parseAgentReadText,
  parseAgentStarted,
  parseWorktreeCreate,
  parseWorktreeList,
  resolveWorkspaceFromHerdrState,
} from "./herdr-decode.js";

const ensureInput = {
  kind: "impl" as const,
  projectId: "1",
  repo: "v36372/agentic-loop",
  repoCheckout: "/tmp/agentic-loop",
  runId: "run-9",
  ticketId: "22",
};

const expectedPath = "/tmp/agentic-loop-runs/run-9";

/** Mixed open/closed worktrees as returned by Herdr 0.7.4. */
const mixedWorktreeList = {
  id: "cli:worktree:list",
  result: {
    source: {
      repo_key: "/tmp/agentic-loop/.git",
      repo_name: "agentic-loop",
      repo_root: "/tmp/agentic-loop",
      source_checkout_path: "/tmp/agentic-loop",
      source_workspace_id: "w0",
    },
    type: "worktree_list",
    worktrees: [
      {
        branch: "main",
        is_bare: false,
        is_detached: false,
        is_linked_worktree: false,
        is_prunable: false,
        label: "agentic-loop",
        open_workspace_id: "w0",
        path: "/tmp/agentic-loop",
      },
      {
        branch: "run/closed",
        is_bare: false,
        is_detached: false,
        is_linked_worktree: true,
        is_prunable: false,
        label: "agentic-loop",
        // closed: no open_workspace_id key
        path: "/tmp/agentic-loop-runs/closed",
      },
      {
        branch: "run/run-9",
        is_bare: false,
        is_detached: false,
        is_linked_worktree: true,
        is_prunable: false,
        label: "run-9",
        open_workspace_id: "w9",
        path: expectedPath,
      },
    ],
  },
};

const emptyWorkspaceList = {
  id: "cli:workspace:list",
  result: { type: "workspace_list", workspaces: [] },
};

const workspaceList = {
  id: "cli:workspace:list",
  result: {
    type: "workspace_list",
    workspaces: [
      {
        active_tab_id: "w9:t1",
        agent_status: "idle",
        focused: false,
        label: "run-9",
        number: 1,
        pane_count: 1,
        tab_count: 1,
        workspace_id: "w9",
      },
    ],
  },
};

const emptyWorktreeList = {
  id: "cli:worktree:list",
  result: {
    source: {
      repo_key: "/tmp/agentic-loop/.git",
      repo_name: "agentic-loop",
      repo_root: "/tmp/agentic-loop",
      source_checkout_path: "/tmp/agentic-loop",
    },
    type: "worktree_list",
    worktrees: [],
  },
};

/** Real Herdr 0.7.4 worktree_created envelope. */
const worktreeCreated = {
  id: "cli:worktree:create",
  result: {
    root_pane: { pane_id: "w9:p1" },
    tab: { tab_id: "w9:t1" },
    type: "worktree_created",
    workspace: {
      active_tab_id: "w9:t1",
      agent_status: "idle",
      focused: false,
      label: "run-9",
      number: 1,
      pane_count: 1,
      tab_count: 1,
      workspace_id: "w9",
    },
    worktree: {
      branch: "run/run-9",
      is_bare: false,
      is_detached: false,
      is_linked_worktree: true,
      is_prunable: false,
      label: "run-9",
      open_workspace_id: "w9",
      path: expectedPath,
    },
  },
};

const agentInfo = (
  status: string,
  overrides: {
    name?: string;
    terminalId?: string;
    workspaceId?: string;
  } = {}
) => ({
  id: "cli:agent:get",
  result: {
    agent: {
      agent: "pi",
      agent_status: status,
      cwd: expectedPath,
      name: overrides.name ?? "run-9-explore-1",
      pane_id: "w9:p2",
      tab_id: "w9:t1",
      terminal_id: overrides.terminalId ?? "term_original",
      workspace_id: overrides.workspaceId ?? "w9",
    },
    type: "agent_info",
  },
});

const agentStarted = (
  overrides: {
    name?: string;
    terminalId?: string;
    workspaceId?: string;
  } = {}
) => ({
  id: "cli:agent:start",
  result: {
    agent: {
      agent_status: "unknown",
      cwd: expectedPath,
      name: overrides.name ?? "run-9-explore-1",
      pane_id: "w9:p2",
      tab_id: "w9:t1",
      terminal_id: overrides.terminalId ?? "term_started",
      workspace_id: overrides.workspaceId ?? "w9",
    },
    argv: ["pi", "-p", "hi"],
    type: "agent_started",
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
  it("decodes mixed open/closed worktree lists without requiring open_workspace_id", () => {
    const worktrees = parseWorktreeList(mixedWorktreeList);
    expect(worktrees).toHaveLength(3);
    expect(worktrees[1]).toStrictEqual({
      label: "agentic-loop",
      path: "/tmp/agentic-loop-runs/closed",
    });
    expect(worktrees[2]?.openWorkspaceId).toBe("w9");
  });

  it("resolves workspace from path + open_workspace_id without empty path", () => {
    const worktrees = parseWorktreeList(mixedWorktreeList);
    const ws = resolveWorkspaceFromHerdrState({
      expectedPath,
      kind: "impl",
      projectId: "1",
      repo: "v36372/agentic-loop",
      runId: "run-9",
      ticketId: "22",
      workspaces: [{ label: "run-9", workspaceId: "w9" }],
      worktrees,
    });
    expect(ws).toStrictEqual({
      kind: "impl",
      path: expectedPath,
      projectId: "1",
      repo: "v36372/agentic-loop",
      runId: "run-9",
      ticketId: "22",
      workspaceId: "w9",
    });
  });

  it("returns undefined when Herdr has no real path/workspace binding", () => {
    const ws = resolveWorkspaceFromHerdrState({
      expectedPath,
      projectId: "1",
      repo: "v36372/agentic-loop",
      runId: "run-9",
      ticketId: "22",
      workspaces: [{ label: "run-9", workspaceId: "w9" }],
      worktrees: [],
    });
    expect(ws).toBeUndefined();
  });

  it("decodes real worktree_created envelopes with nested records", () => {
    expect(parseWorktreeCreate(worktreeCreated)).toStrictEqual({
      path: expectedPath,
      workspaceId: "w9",
    });
  });

  it("rejects invented worktree_create shapes and mismatched open ids", () => {
    expect(() =>
      parseWorktreeCreate({
        id: "cli:worktree:create",
        result: {
          path: expectedPath,
          type: "worktree_create",
          workspace_id: "w9",
        },
      })
    ).toThrow(/decode failed/u);

    expect(() =>
      parseWorktreeCreate({
        id: "cli:worktree:create",
        result: {
          type: "worktree_created",
          workspace: { workspace_id: "w9" },
          worktree: {
            open_workspace_id: "wOTHER",
            path: expectedPath,
          },
        },
      })
    ).toThrow(/open_workspace_id/u);
  });

  it("decodes agent_info and agent_started with required terminal/workspace", () => {
    expect(parseAgentGet(agentInfo("blocked"))).toStrictEqual({
      agentName: "run-9-explore-1",
      status: "blocked",
      terminalId: "term_original",
      workspaceId: "w9",
    });
    expect(parseAgentStarted(agentStarted())).toStrictEqual({
      agentName: "run-9-explore-1",
      status: "unknown",
      terminalId: "term_started",
      workspaceId: "w9",
    });
  });

  it("fails closed on empty start envelopes and missing terminal_id", () => {
    expect(() => parseAgentStarted({ result: {} })).toThrow(/decode failed/u);
    expect(() =>
      parseAgentStarted({
        result: {
          agent: {
            agent_status: "idle",
            name: "run-9-explore-1",
            workspace_id: "w9",
          },
          type: "agent_started",
        },
      })
    ).toThrow(/decode failed/u);
    expect(() => parseAgentGet({ id: "x", result: {} })).toThrow(
      /decode failed/u
    );
  });

  it("decodes summary from result.read.text", () => {
    expect(parseAgentReadText(agentRead)).toBe("phase summary text");
  });
});

describe(makeHerdrCli, () => {
  it("creates a worktree/workspace from real create envelope and verifies list binding", async () => {
    let listedAfterCreate = false;
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "workspace" && args[1] === "list") {
            return listedAfterCreate ? workspaceList : emptyWorkspaceList;
          }
          if (args[0] === "worktree" && args[1] === "list") {
            return listedAfterCreate ? mixedWorktreeList : emptyWorktreeList;
          }
          if (args[0] === "worktree" && args[1] === "create") {
            listedAfterCreate = true;
            return worktreeCreated;
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    const workspace = await Effect.runPromise(
      herdr.ensureRunWorkspace(ensureInput)
    );

    expect(workspace).toStrictEqual({
      kind: "impl",
      path: expectedPath,
      projectId: "1",
      repo: "v36372/agentic-loop",
      runId: "run-9",
      ticketId: "22",
      workspaceId: "w9",
    });
    expect(workspace.workspaceId).not.toBe(`ws-${ensureInput.runId}`);
  });

  it("reattaches workspace from mixed open/closed Herdr list state", async () => {
    let createCalls = 0;
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "workspace" && args[1] === "list") {
            return workspaceList;
          }
          if (args[0] === "worktree" && args[1] === "list") {
            return mixedWorktreeList;
          }
          if (args[0] === "worktree" && args[1] === "create") {
            createCalls += 1;
            return worktreeCreated;
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    const workspace = await Effect.runPromise(
      herdr.ensureRunWorkspace(ensureInput)
    );

    expect(workspace.workspaceId).toBe("w9");
    expect(workspace.path).toBe(expectedPath);
    expect(createCalls).toBe(0);
  });

  it("fails closed when create path mismatches expectedRunPath", async () => {
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "workspace" && args[1] === "list") {
            return emptyWorkspaceList;
          }
          if (args[0] === "worktree" && args[1] === "list") {
            return emptyWorktreeList;
          }
          if (args[0] === "worktree" && args[1] === "create") {
            return {
              ...worktreeCreated,
              result: {
                ...worktreeCreated.result,
                worktree: {
                  ...worktreeCreated.result.worktree,
                  path: "/tmp/wrong-path",
                },
              },
            };
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    await expect(
      Effect.runPromise(herdr.ensureRunWorkspace(ensureInput))
    ).rejects.toThrow(/does not match expected/u);
  });

  it("fails closed when create id is not confirmed by re-list binding", async () => {
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "workspace" && args[1] === "list") {
            return emptyWorkspaceList;
          }
          if (args[0] === "worktree" && args[1] === "list") {
            return emptyWorktreeList;
          }
          if (args[0] === "worktree" && args[1] === "create") {
            // Claims w9/path but list never shows it.
            return worktreeCreated;
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    await expect(
      Effect.runPromise(herdr.ensureRunWorkspace(ensureInput))
    ).rejects.toThrow(/did not list path\/workspace binding/u);
  });

  it("fails closed when workspace list cannot be decoded", async () => {
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "workspace") {
            return { broken: true };
          }
          return mixedWorktreeList;
        }),
    });

    await expect(
      Effect.runPromise(herdr.ensureRunWorkspace(ensureInput))
    ).rejects.toThrow(/decode failed/u);
  });

  it("re-queries on create conflict instead of inventing workspace ids", async () => {
    let createCalls = 0;
    const herdr = makeHerdrCli({
      run: (args) => {
        if (args[0] === "workspace" && args[1] === "list") {
          return Effect.succeed(
            createCalls === 0 ? emptyWorkspaceList : workspaceList
          );
        }
        if (args[0] === "worktree" && args[1] === "list") {
          return Effect.succeed(
            createCalls === 0 ? emptyWorktreeList : mixedWorktreeList
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
      herdr.ensureRunWorkspace(ensureInput)
    );
    expect(createCalls).toBe(1);
    expect(workspace.workspaceId).toBe("w9");
    expect(workspace.path).toBe(expectedPath);
  });

  it("rejects identity conflict when reusing run_id with different ticket", async () => {
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "workspace" && args[1] === "list") {
            return workspaceList;
          }
          if (args[0] === "worktree" && args[1] === "list") {
            return mixedWorktreeList;
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    await Effect.runPromise(herdr.ensureRunWorkspace(ensureInput));
    await expect(
      Effect.runPromise(
        herdr.ensureRunWorkspace({
          ...ensureInput,
          ticketId: "999",
        })
      )
    ).rejects.toThrow(/run identity conflict/u);
  });

  it("reattaches an existing agent using terminal_id as target", async () => {
    let startCalls = 0;
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            return agentInfo("working", { terminalId: "term_existing" });
          }
          if (args[0] === "agent" && args[1] === "start") {
            startCalls += 1;
            return agentStarted();
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    const handle = await Effect.runPromise(
      herdr.startPiPhase({
        agentName: "run-9-explore-1",
        argv: ["pi", "-p", "hi"],
        cwd: expectedPath,
        workspaceId: "w9",
      })
    );
    expect(handle.reattached).toBeTruthy();
    expect(handle.target).toBe("term_existing");
    expect(handle.agentName).toBe("run-9-explore-1");
    expect(startCalls).toBe(0);
  });

  it("starts only when agent get reports not found and pins terminal_id", async () => {
    let startCalls = 0;
    let startArgs: string[] | undefined;
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            return agentNotFound;
          }
          if (args[0] === "agent" && args[1] === "start") {
            startCalls += 1;
            startArgs = [...args];
            return agentStarted({ terminalId: "term_new" });
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    const handle = await Effect.runPromise(
      herdr.startPiPhase({
        agentName: "run-9-explore-1",
        argv: ["pi", "-p", "hi"],
        cwd: expectedPath,
        workspaceId: "w9",
      })
    );
    expect(handle.reattached).toBeFalsy();
    expect(handle.target).toBe("term_new");
    expect(startCalls).toBe(1);
    expect(startArgs).toStrictEqual([
      "agent",
      "start",
      "run-9-explore-1",
      "--workspace",
      "w9",
      "--cwd",
      expectedPath,
      "--no-focus",
      "--",
      "pi",
      "-p",
      "hi",
    ]);
  });

  it("fails closed on empty/malformed start envelopes instead of inventing success", async () => {
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            return agentNotFound;
          }
          if (args[0] === "agent" && args[1] === "start") {
            return { id: "cli:agent:start", result: {} };
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    await expect(
      Effect.runPromise(
        herdr.startPiPhase({
          agentName: "run-9-explore-1",
          argv: ["pi", "-p", "hi"],
          cwd: expectedPath,
          workspaceId: "w9",
        })
      )
    ).rejects.toThrow(/decode failed/u);
  });

  it("fails closed when start/get agent is missing terminal_id or workspace", async () => {
    const missingTerminal = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            return {
              id: "cli:agent:get",
              result: {
                agent: {
                  agent_status: "working",
                  name: "run-9-explore-1",
                  workspace_id: "w9",
                },
                type: "agent_info",
              },
            };
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });
    await expect(
      Effect.runPromise(
        missingTerminal.startPiPhase({
          agentName: "run-9-explore-1",
          argv: ["pi", "-p", "hi"],
          cwd: expectedPath,
          workspaceId: "w9",
        })
      )
    ).rejects.toThrow(/decode failed/u);

    const wrongWorkspace = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            return agentInfo("working", { workspaceId: "wOTHER" });
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });
    await expect(
      Effect.runPromise(
        wrongWorkspace.startPiPhase({
          agentName: "run-9-explore-1",
          argv: ["pi", "-p", "hi"],
          cwd: expectedPath,
          workspaceId: "w9",
        })
      )
    ).rejects.toThrow(/belongs to workspace wOTHER/u);
  });

  it("on contested find-or-start, re-queries and attaches to the winner terminal", async () => {
    let gets = 0;
    let starts = 0;
    const contested = makeHerdrCli({
      run: (args) => {
        if (args[0] === "agent" && args[1] === "get") {
          return Effect.sync(() => {
            gets += 1;
            return gets === 1
              ? agentNotFound
              : agentInfo("working", { terminalId: "term_winner" });
          });
        }
        if (args[0] === "agent" && args[1] === "start") {
          return Effect.gen(function* failConflict() {
            starts += 1;
            return yield* Effect.fail(
              new Error("agent already exists: run-9-explore-1")
            );
          });
        }
        return Effect.fail(new Error(`unexpected ${args.join(" ")}`));
      },
    });

    const handle = await Effect.runPromise(
      contested.startPiPhase({
        agentName: "run-9-explore-1",
        argv: ["pi", "-p", "hi"],
        cwd: expectedPath,
        workspaceId: "w9",
      })
    );
    expect(handle.reattached).toBeTruthy();
    expect(handle.target).toBe("term_winner");
    expect(starts).toBe(1);
    expect(gets).toBe(2);
  });

  it("pins the original terminal_id when the agent name is later reused", async () => {
    const name = "run-9-explore-1";
    let phase: "first" | "reuse" = "first";
    const herdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            if (phase === "first") {
              return agentInfo("working", {
                name,
                terminalId: "term_original",
              });
            }
            // Name now points at a different terminal; wait/read should still use
            // the handle target (original terminal), not the reused name.
            if (args[2] === name) {
              return agentInfo("idle", {
                name,
                terminalId: "term_reused_name",
              });
            }
            if (args[2] === "term_original") {
              return agentInfo("blocked", {
                name: "other",
                terminalId: "term_original",
              });
            }
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });

    const handle = await Effect.runPromise(
      herdr.startPiPhase({
        agentName: name,
        argv: ["pi", "-p", "hi"],
        cwd: expectedPath,
        workspaceId: "w9",
      })
    );
    expect(handle.target).toBe("term_original");

    phase = "reuse";
    const status = await Effect.runPromise(
      herdr.waitAgentTerminal(handle.target, { timeoutMs: 100 })
    );
    expect(status).toBe("blocked");

    let readTarget: string | undefined;
    const summaryHerdr = makeHerdrCli({
      run: (args) =>
        Effect.sync(() => {
          const target = args.at(2);
          readTarget = target;
          return agentRead;
        }),
    });
    const summary = await Effect.runPromise(
      summaryHerdr.readAgentSummary(handle.target)
    );
    expect(readTarget).toBe("term_original");
    expect(summary).toBe("phase summary text");
  });

  it("fails closed when start conflicts and re-query still finds nothing", async () => {
    const herdr = makeHerdrCli({
      run: (args) => {
        if (args[0] === "agent" && args[1] === "get") {
          return Effect.succeed(agentNotFound);
        }
        if (args[0] === "agent" && args[1] === "start") {
          return Effect.fail(new Error("agent already exists"));
        }
        return Effect.fail(new Error(`unexpected ${args.join(" ")}`));
      },
    });

    await expect(
      Effect.runPromise(
        herdr.startPiPhase({
          agentName: "run-9-explore-1",
          argv: ["pi", "-p", "hi"],
          cwd: expectedPath,
          workspaceId: "w9",
        })
      )
    ).rejects.toThrow(/start conflict.*no winner/u);
  });

  it("maps blocked agent get to blocked without waiting only for idle", async () => {
    const herdr = makeHerdrCli({
      pollIntervalMs: 1,
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            return agentInfo("blocked");
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });
    const status = await Effect.runPromise(
      herdr.waitAgentTerminal("term_original", { timeoutMs: 100 })
    );
    expect(status).toBe("blocked");
  });

  it("maps done and idle as terminal success statuses", async () => {
    const wait = (terminal: "done" | "idle") => {
      const herdr = makeHerdrCli({
        pollIntervalMs: 1,
        run: () => Effect.succeed(agentInfo(terminal)),
      });
      return Effect.runPromise(
        herdr.waitAgentTerminal("term_original", { timeoutMs: 50 })
      );
    };
    await expect(wait("done")).resolves.toBe("done");
    await expect(wait("idle")).resolves.toBe("idle");
  });

  it("returns timed_out when agent stays working past deadline", async () => {
    const herdr = makeHerdrCli({
      pollIntervalMs: 5,
      run: (args) =>
        Effect.sync(() => {
          if (args[0] === "agent" && args[1] === "get") {
            return agentInfo("working");
          }
          throw new Error(`unexpected ${args.join(" ")}`);
        }),
    });
    const status = await Effect.runPromise(
      herdr.waitAgentTerminal("term_original", { timeoutMs: 20 })
    );
    expect(status).toBe("timed_out");
  });

  it("bounds hangs when a CLI invocation never resolves and cancels work", async () => {
    let launched = 0;
    let cancelled = 0;
    const hangRun = makeAbortableRun(async (_args, signal) => {
      launched += 1;
      try {
        // Park until the owned abort signal fires; never resolve successfully.
        await delay(2 ** 30, undefined, { signal });
      } catch (error) {
        cancelled += 1;
        throw error;
      }
      throw new Error("hang runner should not resolve");
    });

    const herdr = makeHerdrCli({
      pollIntervalMs: 5,
      run: hangRun,
    });

    const started = Date.now();
    const status = await Effect.runPromise(
      herdr.waitAgentTerminal("term_original", { timeoutMs: 40 })
    );
    const elapsed = Date.now() - started;
    expect(status).toBe("timed_out");
    expect(elapsed).toBeLessThan(500);
    expect(launched).toBeGreaterThanOrEqual(1);
    expect(cancelled).toBe(launched);
  });

  it("fails closed on malformed agent status while waiting", async () => {
    const herdr = makeHerdrCli({
      run: () => Effect.succeed({ id: "cli:agent:get", result: { agent: {} } }),
    });
    await expect(
      Effect.runPromise(
        herdr.waitAgentTerminal("term_original", { timeoutMs: 10 })
      )
    ).rejects.toThrow(/decode failed/u);
  });

  it("fails closed on error envelope while waiting", async () => {
    const herdr = makeHerdrCli({
      run: () => Effect.succeed(agentNotFound),
    });
    await expect(
      Effect.runPromise(
        herdr.waitAgentTerminal("term_original", { timeoutMs: 10 })
      )
    ).rejects.toThrow(/while waiting failed/u);
  });

  it("reads summary from result.read.text", async () => {
    const herdr = makeHerdrCli({
      run: () => Effect.succeed(agentRead),
    });
    const summary = await Effect.runPromise(
      herdr.readAgentSummary("term_original")
    );
    expect(summary).toBe("phase summary text");
  });
});
