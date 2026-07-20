import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import {
  createRecordingSenderState,
  RecordingPhaseCompletionSenderLayer,
} from "./adapters/completion-recording.js";
import {
  createInMemoryHerdrState,
  InMemoryHerdrLayer,
  makeInMemoryHerdr,
} from "./adapters/herdr-memory.js";
import {
  buildPhaseCompleted,
  idempotencyKey,
  mapAgentStatus,
} from "./idempotency.js";
import { runPhase, startPhase } from "./phase.js";
import { decodePhaseCompletedEventSync } from "./schema.js";
import type { StartPhaseRequest } from "./schema.js";

const eventRefs = (
  event: { refs?: Readonly<Record<string, string>> } | undefined
): Readonly<Record<string, string>> | undefined => event?.refs;

const baseRequest = (
  overrides: Partial<StartPhaseRequest> = {}
): StartPhaseRequest => ({
  context: {
    refs: { base: "main" },
    repo_checkout: "/tmp/agentic-loop",
  },
  kind: "impl",
  phase: "explore",
  project_id: "1",
  repo: "v36372/agentic-loop",
  run_id: "run-42",
  ticket_id: "8",
  ...overrides,
});

describe(idempotencyKey, () => {
  it("is stable for the same inputs", () => {
    expect(idempotencyKey("run-1", "explore", 1, "succeeded")).toBe(
      "run-1:explore:1:succeeded"
    );
    expect(idempotencyKey("run-1", "implement", 2, "failed")).toBe(
      "run-1:implement:2:failed"
    );
  });
});

describe(buildPhaseCompleted, () => {
  it("builds a schema-valid completion with operator actor", () => {
    const event = buildPhaseCompleted({
      attempt: 1,
      kind: "impl",
      phase: "explore",
      project_id: "1",
      repo: "v36372/agentic-loop",
      run_id: "run-1",
      status: "succeeded",
      summary: "ok",
      ticket_id: "8",
    });
    expect(event.actor).toBe("operator");
    expect(event.idempotency_key).toBe("run-1:explore:1:succeeded");
    expect(decodePhaseCompletedEventSync(event).run_id).toBe("run-1");
  });
});

describe(mapAgentStatus, () => {
  it("maps agent terminal statuses to phase outcomes", () => {
    expect(mapAgentStatus("idle")).toBe("succeeded");
    expect(mapAgentStatus("done")).toBe("succeeded");
    expect(mapAgentStatus("blocked")).toBe("blocked");
    expect(mapAgentStatus("timed_out")).toBe("failed");
    expect(mapAgentStatus("unknown")).toBe("failed");
  });
});

describe(runPhase, () => {
  it("emits a single succeeded completion on the happy path", async () => {
    const herdrState = createInMemoryHerdrState({
      summary: "explore done",
      terminalStatus: "idle",
    });
    const senderState = createRecordingSenderState();
    const layer = Layer.merge(
      InMemoryHerdrLayer(herdrState),
      RecordingPhaseCompletionSenderLayer(senderState)
    );

    const event = await Effect.runPromise(
      runPhase(baseRequest()).pipe(Effect.provide(layer))
    );

    expect(event.status).toBe("succeeded");
    expect(event.actor).toBe("operator");
    expect(event.phase).toBe("explore");
    expect(event.summary).toBe("explore done");
    expect(event.idempotency_key).toBe("run-42:explore:1:succeeded");
  });

  it("records exactly one completion event for a happy path", async () => {
    const herdrState = createInMemoryHerdrState({ terminalStatus: "idle" });
    const senderState = createRecordingSenderState();
    const layer = Layer.merge(
      InMemoryHerdrLayer(herdrState),
      RecordingPhaseCompletionSenderLayer(senderState)
    );

    await Effect.runPromise(
      runPhase(baseRequest()).pipe(Effect.provide(layer))
    );

    expect(senderState.events).toHaveLength(1);
    expect(senderState.sendCalls).toBe(1);
    expect(herdrState.agents.has("run-42-explore-1")).toBeTruthy();
    expect(eventRefs(senderState.events[0])).toStrictEqual({ base: "main" });
  });

  it("reattaches the same workspace for a repeated ensure", async () => {
    const herdrState = createInMemoryHerdrState();
    const herdr = makeInMemoryHerdr(herdrState);
    const first = await Effect.runPromise(
      herdr.ensureRunWorkspace({
        repo: "v36372/agentic-loop",
        repoCheckout: "/tmp/agentic-loop",
        runId: "run-7",
      })
    );
    const second = await Effect.runPromise(
      herdr.ensureRunWorkspace({
        repo: "v36372/agentic-loop",
        repoCheckout: "/tmp/agentic-loop",
        runId: "run-7",
      })
    );
    expect(second.workspaceId).toBe(first.workspaceId);
    expect(herdrState.createCountByRunId.get("run-7")).toBe(1);
  });

  it("reattaches an in-flight agent instead of starting a second pi", async () => {
    const herdrState = createInMemoryHerdrState({ terminalStatus: "working" });
    const herdr = makeInMemoryHerdr(herdrState);
    const workspace = await Effect.runPromise(
      herdr.ensureRunWorkspace({
        repo: "v36372/agentic-loop",
        repoCheckout: "/tmp/agentic-loop",
        runId: "run-42",
      })
    );
    const first = await Effect.runPromise(
      herdr.startPiPhase({
        agentName: "run-42-explore-1",
        argv: ["pi", "-p", "hello"],
        cwd: workspace.path,
        workspaceId: workspace.workspaceId,
      })
    );
    const second = await Effect.runPromise(
      herdr.startPiPhase({
        agentName: "run-42-explore-1",
        argv: ["pi", "-p", "hello again"],
        cwd: workspace.path,
        workspaceId: workspace.workspaceId,
      })
    );

    expect(first.reattached).toBeFalsy();
    expect(second.reattached).toBeTruthy();
    expect(herdrState.startCountByAgent.get("run-42-explore-1")).toBe(1);
    expect(second.target).toBe(first.target);
  });

  it("treats duplicate completion emits as harmless", async () => {
    const herdrState = createInMemoryHerdrState({ terminalStatus: "idle" });
    const senderState = createRecordingSenderState();
    const layer = Layer.merge(
      InMemoryHerdrLayer(herdrState),
      RecordingPhaseCompletionSenderLayer(senderState)
    );
    const req = baseRequest();

    const first = await Effect.runPromise(
      runPhase(req).pipe(Effect.provide(layer))
    );
    const second = await Effect.runPromise(
      runPhase(req).pipe(Effect.provide(layer))
    );

    expect(second).toStrictEqual(first);
    expect(senderState.events).toHaveLength(1);
    expect(senderState.sendCalls).toBe(1);
  });

  it("maps blocked agent status to blocked completion", async () => {
    const herdrState = createInMemoryHerdrState({ terminalStatus: "blocked" });
    const senderState = createRecordingSenderState();
    const layer = Layer.merge(
      InMemoryHerdrLayer(herdrState),
      RecordingPhaseCompletionSenderLayer(senderState)
    );

    const event = await Effect.runPromise(
      runPhase(baseRequest({ phase: "review" })).pipe(Effect.provide(layer))
    );

    expect(event.status).toBe("blocked");
    expect(event.idempotency_key).toBe("run-42:review:1:blocked");
    expect(senderState.events).toHaveLength(1);
  });

  it("maps timed_out agent status to failed completion", async () => {
    const herdrState = createInMemoryHerdrState({
      terminalStatus: "timed_out",
    });
    const senderState = createRecordingSenderState();
    const layer = Layer.merge(
      InMemoryHerdrLayer(herdrState),
      RecordingPhaseCompletionSenderLayer(senderState)
    );

    const event = await Effect.runPromise(
      runPhase(baseRequest({ attempt: 2, phase: "implement" })).pipe(
        Effect.provide(layer)
      )
    );

    expect(event.status).toBe("failed");
    expect(event.attempt).toBe(2);
    expect(event.idempotency_key).toBe("run-42:implement:2:failed");
  });
});

describe(startPhase, () => {
  it("accepts a phase and returns workspace id without completing", async () => {
    const herdrState = createInMemoryHerdrState();
    const accepted = await Effect.runPromise(
      startPhase(baseRequest()).pipe(
        Effect.provide(InMemoryHerdrLayer(herdrState))
      )
    );
    expect(accepted).toStrictEqual({
      accepted: true,
      attempt: 1,
      phase: "explore",
      run_id: "run-42",
      workspace_id: "ws-run-42",
    });
    expect(herdrState.agents.size).toBe(0);
  });
});
