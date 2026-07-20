import { Effect } from "effect";

/** Placeholder identity for the Herdr/pi phase-driver package. */
export const operatorPing = (name: string): string =>
  Effect.runSync(Effect.succeed(`operator:ok:${name}`));
