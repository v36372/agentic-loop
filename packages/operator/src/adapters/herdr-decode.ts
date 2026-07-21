import { Schema } from "effect";

import type { AgentTerminalStatus, HerdrWorkspace } from "../herdr-port.js";
import type { TicketKind } from "../schema.js";

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

/**
 * Decode an unknown Herdr CLI envelope with a schema, failing closed.
 *
 * @throws {Error} when the envelope does not match the expected schema
 */
const decodeOrThrow = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
  label: string
): S["Type"] => {
  try {
    return Schema.decodeUnknownSync(schema)(value);
  } catch (error) {
    throw new Error(`herdr ${label} decode failed: ${String(error)}`, {
      cause: error,
    });
  }
};

/** Parse `herdr workspace list` into workspace id/label pairs. */
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

/** Parse `herdr worktree list --json` into path/workspace bindings. */
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

/** Parse `herdr workspace get` into a workspace id/label pair. */
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

/** Parse `herdr worktree create --json` into optional path/workspace id. */
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

/** Parse `herdr agent get` into agent name, status, and workspace. */
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

/** Parse `herdr agent list` into agent summaries. */
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

/**
 * Parse `herdr agent read` text and cap length for completion summaries.
 * Prefers `result.read.text`, then top-level `result.text`.
 */
export const parseAgentReadText = (value: unknown): string | undefined => {
  const decoded = decodeOrThrow(AgentReadResult, value, "agent read");
  const text = decoded.result.read?.text ?? decoded.result.text;
  return text === undefined ? undefined : text.slice(0, 2000);
};

/**
 * True when a polled agent status is terminal for wait loops.
 * `working` is non-terminal; `timed_out` is produced by the waiter itself.
 */
export const isTerminalAgentStatus = (
  status: AgentTerminalStatus
): status is "blocked" | "done" | "idle" | "unknown" =>
  status === "idle" ||
  status === "done" ||
  status === "blocked" ||
  status === "unknown";

export interface ResolveWorkspaceInput {
  readonly expectedPath: string;
  readonly kind?: TicketKind;
  readonly projectId: string;
  readonly repo: string;
  readonly runId: string;
  readonly ticketId: string;
  readonly workspaces: { label?: string; workspaceId: string }[];
  readonly worktrees: {
    label?: string;
    openWorkspaceId?: string;
    path: string;
  }[];
}

/**
 * Resolve a run workspace from live Herdr list state without fabricating IDs.
 * Prefers an exact path match with open workspace, then label=`runId` join.
 * Returns `undefined` when Herdr has no matching real path + workspace id.
 */
export const resolveWorkspaceFromHerdrState = (
  input: ResolveWorkspaceInput
): HerdrWorkspace | undefined => {
  const identity = {
    projectId: input.projectId,
    repo: input.repo,
    runId: input.runId,
    ticketId: input.ticketId,
    ...(input.kind === undefined ? {} : { kind: input.kind }),
  };

  const byPath = input.worktrees.find((wt) => wt.path === input.expectedPath);
  if (byPath?.openWorkspaceId) {
    return {
      ...identity,
      path: byPath.path,
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
        ...identity,
        path: worktree.path,
        workspaceId: byLabel.workspaceId,
      };
    }
  }

  return undefined;
};

/**
 * Extract a Herdr CLI error envelope code when present.
 * Used to treat exit-0 error payloads (e.g. `agent_not_found`) as values.
 */
export const herdrErrorCode = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const err = (value as { error?: { code?: string } }).error;
  return typeof err?.code === "string" ? err.code : undefined;
};

/** True when a start/get failure message indicates name/target conflict. */
export const isAgentStartConflictMessage = (message: string): boolean =>
  /already exists|already running|name.*taken|duplicate|conflict|agent_exists/iu.test(
    message
  );
