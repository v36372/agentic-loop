import { Effect, Layer, Option } from "effect";

import { PhaseCompletionSender } from "../completion-port.js";
import type { PhaseCompletionSenderShape } from "../completion-port.js";
import type { PhaseCompletedEvent } from "../schema.js";

export interface RecordingPhaseCompletionState {
  readonly byKey: Map<string, PhaseCompletedEvent>;
  readonly events: PhaseCompletedEvent[];
  sendCalls: number;
}

/** Mutable ledger for recorded completion events under test. */
export const createRecordingSenderState =
  (): RecordingPhaseCompletionState => ({
    byKey: new Map(),
    events: [],
    sendCalls: 0,
  });

/** Build a PhaseCompletionSender that records events in memory. */
export const makeRecordingPhaseCompletionSender = (
  state: RecordingPhaseCompletionState = createRecordingSenderState()
): PhaseCompletionSenderShape => {
  const send = (event: PhaseCompletedEvent) =>
    Effect.sync(() => {
      state.sendCalls += 1;
      if (state.byKey.has(event.idempotency_key)) {
        return;
      }
      state.byKey.set(event.idempotency_key, event);
      state.events.push(event);
    });

  const findByIdempotencyKey = (key: string) =>
    Effect.sync(() => Option.fromNullishOr(state.byKey.get(key)));

  return {
    findByIdempotencyKey,
    send,
  };
};

/** Layer providing the recording completion sender. */
export const RecordingPhaseCompletionSenderLayer = (
  state: RecordingPhaseCompletionState = createRecordingSenderState()
): Layer.Layer<PhaseCompletionSender> =>
  Layer.succeed(
    PhaseCompletionSender,
    makeRecordingPhaseCompletionSender(state)
  );
