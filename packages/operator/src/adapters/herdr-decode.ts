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

/**
 * Minimal workspace list entry used for run-label join.
 * Extra Herdr fields are ignored by struct decoding.
 */
const WorkspaceListEntry = Schema.Struct({
  label: Schema.optionalKey(Schema.String),
  workspace_id: Schema.String,
});

const WorkspaceListResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    type: Schema.optionalKey(Schema.Literals(["workspace_list"])),
    workspaces: Schema.Array(WorkspaceListEntry),
  }),
});

/**
 * Worktree list entry from Herdr 0.7.4.
 * `open_workspace_id` is omitted for closed worktrees — model as optional key.
 */
const WorktreeEntry = Schema.Struct({
  label: Schema.optionalKey(Schema.String),
  open_workspace_id: Schema.optionalKey(Schema.String),
  path: Schema.String,
});

const WorktreeListResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    type: Schema.optionalKey(Schema.Literals(["worktree_list"])),
    worktrees: Schema.Array(WorktreeEntry),
  }),
});

const WorkspaceGetResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    type: Schema.optionalKey(Schema.Literals(["workspace_info"])),
    workspace: Schema.Struct({
      label: Schema.optionalKey(Schema.String),
      workspace_id: Schema.String,
    }),
  }),
});

/**
 * Real `worktree_created` envelope (Herdr 0.7.4 ResponseResult::WorktreeCreated).
 * Requires nested workspace/worktree records rather than invented top-level ids.
 */
const WorktreeCreatedResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    type: Schema.Literals(["worktree_created"]),
    workspace: Schema.Struct({
      label: Schema.optionalKey(Schema.String),
      workspace_id: Schema.String,
    }),
    worktree: Schema.Struct({
      open_workspace_id: Schema.optionalKey(Schema.String),
      path: Schema.String,
    }),
  }),
});

/**
 * Herdr AgentInfo required fields used by start/get.
 * `name` is the assigned agent name; `agent` is the detected kind (e.g. "pi").
 */
const AgentInfo = Schema.Struct({
  agent: Schema.optionalKey(Schema.String),
  agent_status: HerdrAgentStatus,
  cwd: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  pane_id: Schema.optionalKey(Schema.String),
  terminal_id: Schema.String,
  workspace_id: Schema.String,
});

const AgentGetResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    agent: AgentInfo,
    type: Schema.optionalKey(Schema.Literals(["agent_info"])),
  }),
});

const AgentStartedResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    agent: AgentInfo,
    argv: Schema.optionalKey(Schema.Array(Schema.String)),
    type: Schema.Literals(["agent_started"]),
  }),
});

const AgentListResult = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  result: Schema.Struct({
    agents: Schema.Array(AgentInfo),
    type: Schema.optionalKey(Schema.Literals(["agent_list"])),
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

/** Parsed agent identity used for reattach/start/wait handles. */
export interface ParsedAgentInfo {
  readonly agentName?: string;
  readonly status: AgentTerminalStatus;
  readonly terminalId: string;
  readonly workspaceId: string;
}

/** Parsed worktree create binding. */
export interface ParsedWorktreeCreate {
  readonly path: string;
  readonly workspaceId: string;
}

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
    if (wt.open_workspace_id !== undefined) {
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

/**
 * Parse `herdr worktree create --json` as a real `worktree_created` envelope.
 *
 * @throws {Error} when the envelope is not `worktree_created` or lacks binding
 */
export const parseWorktreeCreate = (value: unknown): ParsedWorktreeCreate => {
  const decoded = decodeOrThrow(
    WorktreeCreatedResult,
    value,
    "worktree create"
  );
  const {
    result: {
      workspace: { workspace_id: workspaceId },
      worktree: { open_workspace_id: openId, path },
    },
  } = decoded;
  if (!workspaceId || !path) {
    throw new Error(
      "herdr worktree create decode failed: missing path/workspace_id"
    );
  }
  if (openId !== undefined && openId !== workspaceId) {
    throw new Error(
      `herdr worktree create decode failed: worktree.open_workspace_id ${openId} !== workspace.workspace_id ${workspaceId}`
    );
  }
  return { path, workspaceId };
};

const toParsedAgent = (agent: {
  agent_status: AgentTerminalStatus;
  name?: string;
  terminal_id: string;
  workspace_id: string;
}): ParsedAgentInfo => {
  const out: ParsedAgentInfo = {
    status: agent.agent_status,
    terminalId: agent.terminal_id,
    workspaceId: agent.workspace_id,
  };
  if (agent.name !== undefined) {
    return { ...out, agentName: agent.name };
  }
  return out;
};

/** Parse `herdr agent get` (`agent_info`) into required terminal/workspace ids. */
export const parseAgentGet = (value: unknown): ParsedAgentInfo => {
  const decoded = decodeOrThrow(AgentGetResult, value, "agent get");
  return toParsedAgent(decoded.result.agent);
};

/**
 * Parse `herdr agent start` success as `agent_started`.
 *
 * @throws {Error} when type/agent/terminal fields are missing or malformed
 */
export const parseAgentStarted = (value: unknown): ParsedAgentInfo => {
  const decoded = decodeOrThrow(AgentStartedResult, value, "agent start");
  return toParsedAgent(decoded.result.agent);
};

/** Parse `herdr agent list` into agent summaries with terminal ids. */
export const parseAgentList = (value: unknown): ParsedAgentInfo[] => {
  const decoded = decodeOrThrow(AgentListResult, value, "agent list");
  return decoded.result.agents.map((agent) => toParsedAgent(agent));
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
 * Used to treat exit-0/1 error payloads (e.g. `agent_not_found`) as values.
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

/** True when an error is a CLI wall-clock timeout owned by this adapter. */
export const isHerdrCliTimeoutError = (error: unknown): boolean =>
  error instanceof Error && error.name === "HerdrCliTimeoutError";

/**
 * Error raised when a Herdr CLI invocation exceeds its remaining deadline.
 * Distinct from agent terminal status `timed_out`.
 */
export class HerdrCliTimeoutError extends Error {
  override readonly name = "HerdrCliTimeoutError";
}
