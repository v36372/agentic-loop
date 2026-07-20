import { Schema } from "effect";

import type { AgentTerminalStatus, HerdrWorkspace } from "../herdr-port.js";

const HerdrAgentStatus = Schema.Literals([
  "blocked",
  "done",
  "idle",
  "unknown",
  "working",
]);

const WorkspaceListEntry = Schema.Struct({
  label: Schema.optionalKey(Schema.String),
  workspace_id: Schema.String,
});

const WorkspaceListResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    workspaces: Schema.Array(WorkspaceListEntry),
  }),
});

const WorktreeEntry = Schema.Struct({
  label: Schema.optionalKey(Schema.String),
  open_workspace_id: Schema.NullishOr(Schema.String),
  path: Schema.String,
});

const WorktreeListResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    worktrees: Schema.Array(WorktreeEntry),
  }),
});

const WorkspaceGetResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    workspace: Schema.Struct({
      label: Schema.optionalKey(Schema.String),
      workspace_id: Schema.String,
    }),
  }),
});

const WorktreeCreateResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    path: Schema.optionalKey(Schema.String),
    workspace_id: Schema.optionalKey(Schema.String),
    worktree: Schema.optionalKey(
      Schema.Struct({
        open_workspace_id: Schema.NullishOr(Schema.String),
        path: Schema.optionalKey(Schema.String),
      })
    ),
  }),
});

const AgentInfo = Schema.Struct({
  agent: Schema.NullishOr(Schema.String),
  agent_status: HerdrAgentStatus,
  cwd: Schema.NullishOr(Schema.String),
  pane_id: Schema.optionalKey(Schema.String),
  terminal_id: Schema.optionalKey(Schema.String),
  workspace_id: Schema.optionalKey(Schema.String),
});

const AgentGetResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    agent: AgentInfo,
  }),
});

const AgentListResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    agents: Schema.Array(AgentInfo),
  }),
});

const AgentReadResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    read: Schema.optionalKey(
      Schema.Struct({
        text: Schema.String,
      })
    ),
    text: Schema.optionalKey(Schema.String),
  }),
});

const decodeOrThrow = <A>(
  schema: {
    readonly ["~"]?: unknown;
    // Effect Schema Top-compatible value with Type property for decodeUnknownSync
  } & { readonly Type?: A },
  value: unknown,
  label: string
): A => {
  try {
    return Schema.decodeUnknownSync(schema as never)(value) as A;
  } catch (error) {
    throw new Error(`herdr ${label} decode failed: ${String(error)}`, {
      cause: error,
    });
  }
};

export const parseWorkspaceList = (
  listed: unknown
): { label?: string; workspaceId: string }[] => {
  const decoded = decodeOrThrow(WorkspaceListResult, listed, "workspace list");
  return decoded.result.workspaces.map((ws) => {
    const entry: { label?: string; workspaceId: string } = {
      workspaceId: ws.workspace_id,
    };
    if (ws.label !== undefined) {
      entry.label = ws.label;
    }
    return entry;
  });
};

export const parseWorktreeList = (
  listed: unknown
): {
  label?: string;
  openWorkspaceId?: string;
  path: string;
}[] => {
  const decoded = decodeOrThrow(WorktreeListResult, listed, "worktree list");
  return decoded.result.worktrees.map((wt) => {
    const entry: {
      label?: string;
      openWorkspaceId?: string;
      path: string;
    } = { path: wt.path };
    if (wt.label !== undefined) {
      entry.label = wt.label;
    }
    if (wt.open_workspace_id) {
      entry.openWorkspaceId = wt.open_workspace_id;
    }
    return entry;
  });
};

export const parseWorkspaceGet = (
  value: unknown
): { label?: string; workspaceId: string } => {
  const decoded = decodeOrThrow(WorkspaceGetResult, value, "workspace get");
  const entry: { label?: string; workspaceId: string } = {
    workspaceId: decoded.result.workspace.workspace_id,
  };
  if (decoded.result.workspace.label !== undefined) {
    entry.label = decoded.result.workspace.label;
  }
  return entry;
};

export const parseWorktreeCreate = (
  value: unknown
): { path?: string; workspaceId?: string } => {
  const decoded = decodeOrThrow(WorktreeCreateResult, value, "worktree create");
  const workspaceId =
    decoded.result.workspace_id ??
    decoded.result.worktree?.open_workspace_id ??
    undefined;
  const path = decoded.result.path ?? decoded.result.worktree?.path;
  const out: { path?: string; workspaceId?: string } = {};
  if (path) {
    out.path = path;
  }
  if (workspaceId) {
    out.workspaceId = workspaceId;
  }
  return out;
};

export const parseAgentGet = (
  value: unknown
): {
  agentName?: string;
  status: AgentTerminalStatus;
  workspaceId?: string;
} => {
  const decoded = decodeOrThrow(AgentGetResult, value, "agent get");
  const out: {
    agentName?: string;
    status: AgentTerminalStatus;
    workspaceId?: string;
  } = {
    status: decoded.result.agent.agent_status,
  };
  if (decoded.result.agent.agent) {
    out.agentName = decoded.result.agent.agent;
  }
  if (decoded.result.agent.workspace_id) {
    out.workspaceId = decoded.result.agent.workspace_id;
  }
  return out;
};

export const parseAgentList = (
  value: unknown
): {
  agentName?: string;
  status: AgentTerminalStatus;
  workspaceId?: string;
}[] => {
  const decoded = decodeOrThrow(AgentListResult, value, "agent list");
  return decoded.result.agents.map((agent) => {
    const out: {
      agentName?: string;
      status: AgentTerminalStatus;
      workspaceId?: string;
    } = { status: agent.agent_status };
    if (agent.agent) {
      out.agentName = agent.agent;
    }
    if (agent.workspace_id) {
      out.workspaceId = agent.workspace_id;
    }
    return out;
  });
};

export const parseAgentReadText = (value: unknown): string | undefined => {
  const decoded = decodeOrThrow(AgentReadResult, value, "agent read");
  const text = decoded.result.read?.text ?? decoded.result.text;
  return text === undefined ? undefined : text.slice(0, 2000);
};

export const isTerminalAgentStatus = (
  status: AgentTerminalStatus
): status is "blocked" | "done" | "idle" | "unknown" =>
  status === "idle" ||
  status === "done" ||
  status === "blocked" ||
  status === "unknown";

export const resolveWorkspaceFromHerdrState = (input: {
  readonly expectedPath: string;
  readonly repo: string;
  readonly runId: string;
  readonly workspaces: { label?: string; workspaceId: string }[];
  readonly worktrees: {
    label?: string;
    openWorkspaceId?: string;
    path: string;
  }[];
}): HerdrWorkspace | undefined => {
  const byPath = input.worktrees.find((wt) => wt.path === input.expectedPath);
  if (byPath?.openWorkspaceId) {
    return {
      path: byPath.path,
      repo: input.repo,
      runId: input.runId,
      workspaceId: byPath.openWorkspaceId,
    };
  }

  const byLabel = input.workspaces.find((ws) => ws.label === input.runId);
  if (byLabel) {
    const worktree = input.worktrees.find(
      (wt) => wt.openWorkspaceId === byLabel.workspaceId
    );
    if (worktree?.path) {
      return {
        path: worktree.path,
        repo: input.repo,
        runId: input.runId,
        workspaceId: byLabel.workspaceId,
      };
    }
  }

  return undefined;
};

export const herdrErrorCode = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const err = (value as { error?: { code?: string } }).error;
  return typeof err?.code === "string" ? err.code : undefined;
};
