import { once } from "node:events";
import { createConnection } from "node:net";
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
  MAX_START_PHASE_BODY_BYTES,
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

const postStart = (url: string, body: unknown): Promise<Response> =>
  fetch(`${url}/v1/phases/start`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

const rawPost = async (
  serverUrl: string,
  requestText: string
): Promise<string> => {
  const parsed = new URL(serverUrl);
  const port = Number(parsed.port);
  const host = parsed.hostname;
  const socket = createConnection({ host, port });
  socket.setEncoding("utf-8");
  let response = "";
  socket.on("data", (chunk: string) => {
    response += chunk;
    if (response.includes("\r\n\r\n")) {
      socket.end();
    }
  });
  socket.write(requestText);
  await once(socket, "end");
  return response;
};

describe(listenControlHttp, () => {
  it("accepts POST /v1/phases/start with memory layers", async () => {
    const memory = makeMemoryPhaseLayer();
    const server = await listenControlHttp({
      babysit: true,
      phaseLayer: memory.layer,
    });

    try {
      const response = await postStart(server.url, startBody);
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
      const response = await postStart(server.url, { phase: "explore" });
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
      const response = await postStart(server.url, {
        ...startBody,
        run_id: "../escape",
      });
      expect(response.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("rejects malformed repository identities with 400", async () => {
    const memory = makeMemoryPhaseLayer();
    const server = await listenControlHttp({
      babysit: false,
      phaseLayer: memory.layer,
    });
    try {
      const repos = ["../repo", "owner/..", "-owner/repo", "owner/-repo"];
      const statuses = await Promise.all(
        repos.map(async (repo) => {
          const response = await postStart(server.url, {
            ...startBody,
            repo,
          });
          return response.status;
        })
      );
      expect(statuses).toStrictEqual([400, 400, 400, 400]);
    } finally {
      await server.close();
    }
  });

  it("rejects conflicting identity reuse before 202", async () => {
    const memory = makeMemoryPhaseLayer();
    const server = await listenControlHttp({
      babysit: false,
      phaseLayer: memory.layer,
    });

    try {
      const first = await postStart(server.url, {
        ...startBody,
        run_id: "run-conflict",
      });
      const second = await postStart(server.url, {
        ...startBody,
        run_id: "run-conflict",
        ticket_id: "99",
      });
      const body = (await second.json()) as { error?: string };

      expect({
        firstStatus: first.status,
        secondError: body.error,
        secondStatus: second.status,
      }).toStrictEqual({
        firstStatus: 202,
        secondError: "run_identity_conflict",
        secondStatus: 409,
      });
    } finally {
      await server.close();
    }
  });

  it("accepts same-identity retries harmlessly", async () => {
    const memory = makeMemoryPhaseLayer();
    const server = await listenControlHttp({
      babysit: true,
      phaseLayer: memory.layer,
    });

    try {
      const first = await postStart(server.url, {
        ...startBody,
        run_id: "run-retry",
      });
      const second = await postStart(server.url, {
        ...startBody,
        run_id: "run-retry",
      });
      await waitFor(() => memory.senderState.events.length > 0, 2000);

      expect({
        createCount: memory.herdrState.createCountByRunId.get("run-retry"),
        eventCount: memory.senderState.events.length,
        firstStatus: first.status,
        secondStatus: second.status,
      }).toStrictEqual({
        createCount: 1,
        eventCount: 1,
        firstStatus: 202,
        secondStatus: 202,
      });
    } finally {
      await server.close();
    }
  });

  it("rejects declared oversized bodies with 413", async () => {
    const memory = makeMemoryPhaseLayer();
    const server = await listenControlHttp({
      babysit: false,
      phaseLayer: memory.layer,
    });

    try {
      const oversize = "x".repeat(MAX_START_PHASE_BODY_BYTES + 1);
      const response = await fetch(`${server.url}/v1/phases/start`, {
        body: oversize,
        headers: {
          "content-length": String(oversize.length),
          "content-type": "application/json",
        },
        method: "POST",
      });
      const body = (await response.json()) as {
        error?: string;
        max_bytes?: number;
      };
      expect({
        error: body.error,
        max_bytes: body.max_bytes,
        status: response.status,
      }).toStrictEqual({
        error: "payload_too_large",
        max_bytes: MAX_START_PHASE_BODY_BYTES,
        status: 413,
      });
    } finally {
      await server.close();
    }
  });

  it("rejects chunked oversized bodies with 413", async () => {
    const memory = makeMemoryPhaseLayer();
    const server = await listenControlHttp({
      babysit: false,
      phaseLayer: memory.layer,
    });

    try {
      const oversize = "y".repeat(MAX_START_PHASE_BODY_BYTES + 64);
      const chunkHex = oversize.length.toString(16);
      const request =
        "POST /v1/phases/start HTTP/1.1\r\n" +
        "Host: 127.0.0.1\r\n" +
        "Transfer-Encoding: chunked\r\n" +
        "Content-Type: application/json\r\n" +
        "Connection: close\r\n" +
        "\r\n" +
        `${chunkHex}\r\n` +
        `${oversize}\r\n` +
        "0\r\n\r\n";
      const raw = await rawPost(server.url, request);
      expect(raw).toMatch(/HTTP\/1\.1 413/u);
      expect(raw).toMatch(/payload_too_large/u);
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
      const start = await postStart(server.url, startBody);
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
