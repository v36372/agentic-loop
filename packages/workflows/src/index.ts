import { trackerPing } from "@agentic-loop/tracker";
import { Effect } from "effect";

/** Placeholder identity for the durable-workflow package. */
export const workflowsPing = (name: string): string => {
  const board = trackerPing(name);
  return Effect.runSync(Effect.succeed(`workflows:ok:${board}`));
};
