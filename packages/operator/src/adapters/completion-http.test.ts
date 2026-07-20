import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { buildPhaseCompleted } from "../idempotency.js";
import {
  makeHttpPhaseCompletionSender,
  toInngestEnvelope,
} from "./completion-http.js";

const sampleEvent = buildPhaseCompleted({
  attempt: 1,
  phase: "explore",
  project_id: "1",
  repo: "v36372/agentic-loop",
  run_id: "run-1",
  status: "succeeded",
  ticket_id: "8",
});

describe(toInngestEnvelope, () => {
  it("puts idempotency_key in top-level id for Inngest de-dupe", () => {
    expect(toInngestEnvelope(sampleEvent)).toStrictEqual({
      data: sampleEvent,
      id: "run-1:explore:1:succeeded",
      name: "herdr/phase.completed",
    });
  });
});

describe(makeHttpPhaseCompletionSender, () => {
  it("POSTs the Inngest envelope shape", async () => {
    const requests: { body: string; method: string; url: string }[] = [];
    const sender = makeHttpPhaseCompletionSender({
      fetchImpl: (input, init) => {
        requests.push({
          body: String(init?.body ?? ""),
          method: String(init?.method ?? "GET"),
          url: String(input),
        });
        return Promise.resolve(new Response(null, { status: 200 }));
      },
      url: "https://inn.example/e/key",
    });

    await Effect.runPromise(sender.send(sampleEvent));

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.url).toBe("https://inn.example/e/key");
    expect(JSON.parse(requests[0]?.body ?? "{}")).toStrictEqual({
      data: sampleEvent,
      id: sampleEvent.idempotency_key,
      name: "herdr/phase.completed",
    });
  });

  it("skips network on duplicate idempotency key in-process", async () => {
    let calls = 0;
    const sender = makeHttpPhaseCompletionSender({
      fetchImpl: () => {
        calls += 1;
        return Promise.resolve(new Response(null, { status: 200 }));
      },
      url: "https://inn.example/e/key",
    });

    await Effect.runPromise(sender.send(sampleEvent));
    await Effect.runPromise(sender.send(sampleEvent));
    expect(calls).toBe(1);
  });

  it("fails when the sink returns non-2xx", async () => {
    const sender = makeHttpPhaseCompletionSender({
      fetchImpl: () => Promise.resolve(new Response("nope", { status: 500 })),
      url: "https://inn.example/e/key",
    });
    await expect(Effect.runPromise(sender.send(sampleEvent))).rejects.toThrow(
      /HTTP 500/u
    );
  });
});
