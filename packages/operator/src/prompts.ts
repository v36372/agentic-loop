import { resolveAttempt } from "./idempotency.js";
import type { Attempt, StartPhaseRequest, WorkPhase } from "./schema.js";

const defaultPrompt = (
  phase: WorkPhase,
  attempt: Attempt,
  req: StartPhaseRequest
): string => {
  const issue = req.context.issue_url ?? req.ticket_id;
  const base = [
    `You are the CODER agent in agentic-loop work run \`${req.run_id}\`.`,
    `Phase: ${phase} (attempt ${attempt}).`,
    `Ticket: ${req.ticket_id} (${req.repo}).`,
    `Issue: ${issue}.`,
    "Follow package boundaries. Prefer ports/adapters. Do not drive Inngest policy.",
  ];

  switch (phase) {
    case "explore": {
      return [
        ...base,
        "Phase: EXPLORE (read-only — do not implement yet).",
        "Write a short explore report under docs/runs/ when appropriate, then stop.",
      ].join("\n");
    }
    case "implement": {
      return [
        ...base,
        attempt > 1
          ? "Phase: IMPLEMENT rework — address prior review findings."
          : "Phase: IMPLEMENT — make the smallest correct change.",
        "Keep changes scoped to the ticket. Run quality gates before finishing.",
      ].join("\n");
    }
    case "review": {
      return [
        ...base,
        "Phase: REVIEW — adversarial review of the implementation.",
        "Report findings clearly; approve only when acceptance criteria hold.",
      ].join("\n");
    }
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
};

/** Build `pi` argv for a phase (non-interactive print mode). */
export const buildPiArgv = (req: StartPhaseRequest): readonly string[] => {
  const attempt = resolveAttempt(req);
  const prompt = req.context.prompt ?? defaultPrompt(req.phase, attempt, req);
  return ["pi", "-p", "--approve", prompt];
};
