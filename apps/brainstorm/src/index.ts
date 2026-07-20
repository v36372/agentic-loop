import { trackerPing } from "@agentic-loop/tracker";
import { Effect } from "effect";

/** Placeholder identity for the Telegram brainstormer app. */
export const brainstormPing = (name: string): string => {
  const board = trackerPing(name);
  return Effect.runSync(Effect.succeed(`brainstorm:ok:${board}`));
};
