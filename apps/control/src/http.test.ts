import { setTimeout as delay } from "node:timers/promises";

import {
  createInMemoryHerdrState,
  createRecordingSenderState,
  HerdrPort,
  makeInMemoryHerdr,
  RecordingPhaseCompletionSenderLayer,
} from "@agentic-loop/operator";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import {
  healthzFromFailures,
  listenControlHttp,
  MAX_PHASE_FAILURES,
} from "./http.js";
import type { PhaseBabysitFailure } from "./http.js";
import { makeMemoryPhaseLayer } from "./layers.js";

const startBody = {
  context: {
    repo_checkout: "/tmp/agentic-loop",
  },
  kind: "impl",
  phase: "explore",
  project_id: "1",
  repo: "v36372/agentic-loop",
  run_id: "run-http-1",
  ticket_id: "8",
};

const waitFor = async (
  predicate: () => boolean,
  timeoutMs: number
): Promise<void> => {
  const deadline = Date.now() + Math.max(timeoutMs, 0);
  if (predicate() || Date.now() >= deadline) {
    return;
  }
  await delay(10);
  await waitFor(predicate, deadline - Date.now());
};

describe(listenControlHttp, () => {
  it("accepts POST /v1/phases/start with memory layers", async () => {
    const memory = makeMemoryPhaseLayer();
    const server = await listenControlHttp({
      babysit: true,
      phaseLayer: memory.layer,
    });

    try {
      const response = await fetch(`${server.url}/v1/phases/start`, {
        body: JSON.stringify(startBody),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const accepted = (await response.json()) as {
        accepted: boolean;
        attempt: number;
        phase: string;
        run_id: string;
        workspace_id?: string;
      };
      await waitFor(() => memory.senderState.events.length > 0, 2000);

      expect({
        accepted,
        eventCount: memory.senderState.events.length,
        eventName: memory.senderState.events[0]?.name,
        status: response.status,
      }).toStrictEqual({
        accepted: {
          accepted: true,
          attempt: 1,
          phase: "explore",
          run_id: "run-http-1",
          workspace_id: "ws-run-http-1",
        },
        eventCount: 1,
        eventName: "herdr/phase.completed",
        status: 202,
      });
    } finally {
      await server.close();
    }
  });

  it("rejects invalid start-phase bodies with 400", async () => {
    const memory = makeMemoryPhaseLayer();
    const server = await listenControlHttp({
      babysit: false,
      phaseLayer: memory.layer,
    });
    try {
      const response = await fetch(`${server.url}/v1/phases/start`, {
        body: JSON.stringify({ phase: "explore" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(response.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("rejects unsafe run_id values with 400", async () => {
    const memory = makeMemoryPhaseLayer();
    const server = await listenControlHttp({
      babysit: false,
      phaseLayer: memory.layer,
    });
    try {
      const response = await fetch(`${server.url}/v1/phases/start`, {
        body: JSON.stringify({
          ...startBody,
          run_id: "../escape",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      expect(response.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("records background phase failures and degrades healthz", async () => {
    const herdrState = createInMemoryHerdrState();
    const senderState = createRecordingSenderState();
    const baseHerdr = makeInMemoryHerdr(herdrState);
    const failingLayer = Layer.merge(
      Layer.succeed(HerdrPort, {
        ...baseHerdr,
        waitAgentTerminal: () =>
          Effect.fail(new Error("simulated babysit failure")),
      }),
      RecordingPhaseCompletionSenderLayer(senderState)
    );

    const failures: PhaseBabysitFailure[] = [];
    const server = await listenControlHttp({
      babysit: true,
      phaseFailures: failures,
      phaseLayer: failingLayer,
    });

    try {
      const start = await fetch(`${server.url}/v1/phases/start`, {
        body: JSON.stringify(startBody),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      await waitFor(() => failures.length > 0, 2000);
      const health = await fetch(`${server.url}/healthz`);
      const body = (await health.json()) as {
        degraded: boolean;
        last_phase_error: { error: string } | null;
        ok: boolean;
        phase_failure_count: number;
      };

      expect({
        completionCount: senderState.events.length,
        failureCount: failures.length,
        failureError: failures[0]?.error,
        healthBody: {
          degraded: body.degraded,
          last_error: body.last_phase_error?.error,
          ok: body.ok,
          phase_failure_count: body.phase_failure_count,
        },
        healthStatus: health.status,
        startStatus: start.status,
      }).toStrictEqual({
        completionCount: 0,
        failureCount: 1,
        failureError: "Error: simulated babysit failure",
        healthBody: {
          degraded: true,
          last_error: "Error: simulated babysit failure",
          ok: true,
          phase_failure_count: 1,
        },
        healthStatus: 200,
        startStatus: 202,
      });
    } finally {
      await server.close();
    }
  });

  it("serves GET /healthz with healthy diagnostics by default", async () => {
    const memory = makeMemoryPhaseLayer();
    const server = await listenControlHttp({
      babysit: false,
      phaseLayer: memory.layer,
    });
    try {
      const response = await fetch(`${server.url}/healthz`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toStrictEqual({
        degraded: false,
        last_phase_error: null,
        ok: true,
        phase_failure_count: 0,
      });
    } finally {
      await server.close();
    }
  });
});

describe(healthzFromFailures, () => {
  it("bounds failure visibility to the retained ledger", () => {
    const failures = Array.from({ length: MAX_PHASE_FAILURES }, (_, i) => ({
      at: new Date(0).toISOString(),
      error: `err-${i}`,
      phase: "explore",
      run_id: `run-${i}`,
    }));
    const health = healthzFromFailures(failures);
    expect({
      degraded: health.degraded,
      last_error: health.last_phase_error?.error,
      phase_failure_count: health.phase_failure_count,
    }).toStrictEqual({
      degraded: true,
      last_error: `err-${MAX_PHASE_FAILURES - 1}`,
      phase_failure_count: MAX_PHASE_FAILURES,
    });
  });
});
