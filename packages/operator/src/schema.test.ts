import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  decodePhaseCompletedEventSync,
  decodeStartPhaseRequestSync,
  PhaseCompletedEvent,
  RunId,
  StartPhaseRequest,
} from "./schema.js";

describe(StartPhaseRequest, () => {
  it("accepts a minimal valid start-phase request", () => {
    const decoded = decodeStartPhaseRequestSync({
      context: {},
      phase: "explore",
      project_id: "1",
      repo: "v36372/agentic-loop",
      run_id: "run-1",
      ticket_id: "8",
    });
    expect(decoded.run_id).toBe("run-1");
    expect(decoded.phase).toBe("explore");
    expect(decoded.context).toStrictEqual({});
  });

  it("accepts optional kind, attempt, refs, and prompt", () => {
    const decoded = decodeStartPhaseRequestSync({
      actor: "control",
      attempt: 2,
      context: {
        issue_url: "https://github.com/v36372/agentic-loop/issues/8",
        prompt: "custom",
        refs: { pr_url: "https://example/pr/1" },
        repo_checkout: "/tmp/agentic-loop",
      },
      kind: "impl",
      phase: "implement",
      project_id: "1",
      repo: "v36372/agentic-loop",
      run_id: "run-2",
      ticket_id: "8",
    });
    expect(decoded.kind).toBe("impl");
    expect(decoded.attempt).toBe(2);
    expect(decoded.context.prompt).toBe("custom");
  });

  it("rejects missing required identity fields", () => {
    expect(() =>
      decodeStartPhaseRequestSync({
        context: {},
        phase: "explore",
        project_id: "1",
        repo: "v36372/agentic-loop",
        ticket_id: "8",
      })
    ).toThrow(/run_id|SchemaError|Missing/u);
  });

  it("rejects empty identity strings", () => {
    expect(() =>
      decodeStartPhaseRequestSync({
        context: {},
        phase: "explore",
        project_id: "1",
        repo: "v36372/agentic-loop",
        run_id: "",
        ticket_id: "8",
      })
    ).toThrow(/run_id|NonEmpty|SchemaError|min|length|pattern|Pattern/iu);
  });

  it("rejects path traversal and separator run_id values", () => {
    for (const run_id of [
      "../other-checkout",
      "/absolute",
      "run/1",
      "run\\1",
      "run id",
      " run-1",
      "run-1 ",
      ".",
      "..",
      "-leading-dash",
    ]) {
      expect(() =>
        decodeStartPhaseRequestSync({
          context: {},
          phase: "explore",
          project_id: "1",
          repo: "v36372/agentic-loop",
          run_id,
          ticket_id: "8",
        })
      ).toThrow(/run_id|SchemaError|pattern|Pattern/iu);
    }
  });

  it("rejects overlong run_id values", () => {
    expect(() =>
      decodeStartPhaseRequestSync({
        context: {},
        phase: "explore",
        project_id: "1",
        repo: "v36372/agentic-loop",
        run_id: `r${"a".repeat(63)}`,
        ticket_id: "8",
      })
    ).toThrow(/run_id|SchemaError|length|max|pattern|Pattern/iu);
  });

  it("rejects non owner/name repo refs", () => {
    expect(() =>
      decodeStartPhaseRequestSync({
        context: {},
        phase: "explore",
        project_id: "1",
        repo: "agentic-loop",
        run_id: "run-1",
        ticket_id: "8",
      })
    ).toThrow(/repo|SchemaError|pattern|Pattern/iu);
  });

  it("rejects unknown phase values", () => {
    expect(() =>
      decodeStartPhaseRequestSync({
        context: {},
        phase: "verifier",
        project_id: "1",
        repo: "v36372/agentic-loop",
        run_id: "run-1",
        ticket_id: "8",
      })
    ).toThrow(/phase|SchemaError|Literal/u);
  });

  it("rejects attempt less than 1", () => {
    expect(() =>
      decodeStartPhaseRequestSync({
        attempt: 0,
        context: {},
        phase: "implement",
        project_id: "1",
        repo: "v36372/agentic-loop",
        run_id: "run-1",
        ticket_id: "8",
      })
    ).toThrow(/attempt|SchemaError|greater|filter/iu);
  });
});

describe(RunId, () => {
  it("accepts bounded safe tokens", () => {
    expect(Schema.decodeUnknownSync(RunId)("run-1")).toBe("run-1");
    expect(Schema.decodeUnknownSync(RunId)("A_b.1-x")).toBe("A_b.1-x");
  });
});

describe(PhaseCompletedEvent, () => {
  it("accepts a valid completion payload", () => {
    const decoded = decodePhaseCompletedEventSync({
      actor: "operator",
      attempt: 1,
      idempotency_key: "run-1:explore:1:succeeded",
      name: "herdr/phase.completed",
      phase: "explore",
      project_id: "1",
      repo: "v36372/agentic-loop",
      run_id: "run-1",
      status: "succeeded",
      ticket_id: "8",
    });
    expect(decoded.name).toBe("herdr/phase.completed");
    expect(decoded.idempotency_key).toBe("run-1:explore:1:succeeded");
  });

  it("rejects missing idempotency_key", () => {
    expect(() =>
      decodePhaseCompletedEventSync({
        actor: "operator",
        attempt: 1,
        name: "herdr/phase.completed",
        phase: "explore",
        project_id: "1",
        repo: "v36372/agentic-loop",
        run_id: "run-1",
        status: "succeeded",
        ticket_id: "8",
      })
    ).toThrow(/idempotency_key|SchemaError|Missing/u);
  });

  it("rejects mismatched idempotency_key", () => {
    expect(() =>
      decodePhaseCompletedEventSync({
        actor: "operator",
        attempt: 1,
        idempotency_key: "other:explore:1:succeeded",
        name: "herdr/phase.completed",
        phase: "explore",
        project_id: "1",
        repo: "v36372/agentic-loop",
        run_id: "run-1",
        status: "succeeded",
        ticket_id: "8",
      })
    ).toThrow(/idempotency_key|SchemaError|must equal/iu);
  });

  it("rejects unknown status", () => {
    expect(() =>
      Schema.decodeUnknownSync(PhaseCompletedEvent)({
        actor: "operator",
        attempt: 1,
        idempotency_key: "run-1:explore:1:running",
        name: "herdr/phase.completed",
        phase: "explore",
        project_id: "1",
        repo: "v36372/agentic-loop",
        run_id: "run-1",
        status: "running",
        ticket_id: "8",
      })
    ).toThrow(/status|SchemaError|Literal/u);
  });
});
