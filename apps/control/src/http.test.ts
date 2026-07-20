import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { listenControlHttp } from "./http.js";
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

const waitForEvents = async (
  getCount: () => number,
  timeoutMs: number
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  const poll = async (): Promise<void> => {
    if (getCount() > 0 || Date.now() >= deadline) {
      return;
    }
    await delay(10);
    await poll();
  };
  await poll();
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
      expect(response.status).toBe(202);
      const accepted = (await response.json()) as {
        accepted: boolean;
        run_id: string;
        workspace_id?: string;
      };
      expect(accepted.accepted).toBeTruthy();
      expect(accepted.run_id).toBe("run-http-1");
      expect(accepted.workspace_id).toBe("ws-run-http-1");

      await waitForEvents(() => memory.senderState.events.length, 2000);
      expect(memory.senderState.events).toHaveLength(1);
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
});
