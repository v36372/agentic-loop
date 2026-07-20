import { Effect, Layer, Option } from "effect";

import { PhaseCompletionSender } from "../completion-port.js";
import type { PhaseCompletionSenderShape } from "../completion-port.js";
import type { PhaseCompletedEvent } from "../schema.js";

export interface RecordingPhaseCompletionState {
  readonly byKey: Map<string, PhaseCompletedEvent>;
  readonly events: PhaseCompletedEvent[];
  sendCalls: number;
}

export const createRecordingSenderState =
  (): RecordingPhaseCompletionState => ({
    byKey: new Map(),
    events: [],
    sendCalls: 0,
  });

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

export const RecordingPhaseCompletionSenderLayer = (
  state: RecordingPhaseCompletionState = createRecordingSenderState()
): Layer.Layer<PhaseCompletionSender> =>
  Layer.succeed(
    PhaseCompletionSender,
    makeRecordingPhaseCompletionSender(state)
  );
