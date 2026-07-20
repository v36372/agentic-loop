import { Effect, Layer, Option } from "effect";

import { PhaseCompletionSender } from "../completion-port.js";
import type { PhaseCompletionSenderShape } from "../completion-port.js";
import type { PhaseCompletedEvent } from "../schema.js";

export interface HttpPhaseCompletionSenderOptions {
  readonly fetchImpl?: typeof fetch;
  /** Optional process-local cache; transport id is the durable de-dupe key. */
  readonly seen?: Map<string, PhaseCompletedEvent>;
  readonly url: string;
}

export interface InngestEventEnvelope {
  readonly data: PhaseCompletedEvent;
  readonly id: string;
  readonly name: "herdr/phase.completed";
}

/** Build the Inngest Event API body for a phase completion. */
export const toInngestEnvelope = (
  event: PhaseCompletedEvent
): InngestEventEnvelope => ({
  data: event,
  id: event.idempotency_key,
  name: "herdr/phase.completed",
});

/**
 * POSTs Inngest-compatible event envelopes:
 * `{ name, id: idempotency_key, data: PhaseCompletedEvent }`.
 * Inngest uses top-level `id` for event deduplication across retries/restarts.
 */
export const makeHttpPhaseCompletionSender = (
  options: HttpPhaseCompletionSenderOptions
): PhaseCompletionSenderShape => {
  if (!options.url) {
    throw new Error("HttpPhaseCompletionSender requires a non-empty url");
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const seen = options.seen ?? new Map<string, PhaseCompletedEvent>();

  const send = (event: PhaseCompletedEvent) =>
    Effect.gen(function* sendCompletion() {
      if (seen.has(event.idempotency_key)) {
        return;
      }
      const envelope = toInngestEnvelope(event);
      const response = yield* Effect.tryPromise({
        catch: (error) =>
          new Error(`phase completion POST failed: ${String(error)}`),
        try: () =>
          fetchImpl(options.url, {
            body: JSON.stringify(envelope),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
      });
      if (!response.ok) {
        return yield* Effect.fail(
          new Error(
            `phase completion POST HTTP ${response.status} ${response.statusText}`
          )
        );
      }
      seen.set(event.idempotency_key, event);
    });

  const findByIdempotencyKey = (key: string) =>
    Effect.sync(() => Option.fromNullishOr(seen.get(key)));

  return {
    findByIdempotencyKey,
    send,
  };
};

export const HttpPhaseCompletionSenderLayer = (
  options: HttpPhaseCompletionSenderOptions
): Layer.Layer<PhaseCompletionSender> =>
  Layer.succeed(PhaseCompletionSender, makeHttpPhaseCompletionSender(options));
