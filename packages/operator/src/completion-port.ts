import { Context } from "effect";
import type { Effect, Option } from "effect";

import type { PhaseCompletedEvent } from "./schema.js";

export interface PhaseCompletionSenderShape {
  readonly findByIdempotencyKey: (
    key: string
  ) => Effect.Effect<Option.Option<PhaseCompletedEvent>, Error>;
  readonly send: (event: PhaseCompletedEvent) => Effect.Effect<void, Error>;
}

/** Emits herdr/phase.completed; duplicate idempotency keys are no-ops. */
export class PhaseCompletionSender extends Context.Service<
  PhaseCompletionSender,
  PhaseCompletionSenderShape
>()("PhaseCompletionSender") {}
