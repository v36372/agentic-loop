import { Effect } from "effect";

/** Placeholder identity for the board-port package. */
export const trackerPing = (name: string): string =>
  Effect.runSync(Effect.succeed(`tracker:ok:${name}`));
