import { trackerPing } from "@agentic-loop/tracker";
import { workflowsPing } from "@agentic-loop/workflows";
import { Effect } from "effect";

/** Placeholder identity for the control-plane ingress app. */
export const controlPing = (name: string): string => {
  const board = trackerPing(name);
  const flow = workflowsPing(name);
  return Effect.runSync(Effect.succeed(`control:ok:${board}:${flow}`));
};
