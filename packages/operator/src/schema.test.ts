import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  decodePhaseCompletedEventSync,
  decodeStartPhaseRequestSync,
  PhaseCompletedEvent,
  RepoName,
  RepoOwner,
  RepoRef,
  RunId,
  StartPhaseRequest,
} from "./schema.js";

const validStart = (overrides: Record<string, unknown> = {}) => ({
  context: {},
  phase: "explore",
  project_id: "1",
  repo: "v36372/agentic-loop",
  run_id: "run-1",
  ticket_id: "8",
  ...overrides,
});

describe(StartPhaseRequest, () => {
  it("accepts a minimal valid start-phase request", () => {
    const decoded = decodeStartPhaseRequestSync(validStart());
    expect(decoded.run_id).toBe("run-1");
    expect(decoded.phase).toBe("explore");
    expect(decoded.context).toStrictEqual({});
  });

  it("accepts optional kind, attempt, refs, and prompt", () => {
    const decoded = decodeStartPhaseRequestSync(
      validStart({
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
        run_id: "run-2",
      })
    );
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
      decodeStartPhaseRequestSync(validStart({ run_id: "" }))
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
      expect(() => decodeStartPhaseRequestSync(validStart({ run_id }))).toThrow(
        /run_id|SchemaError|pattern|Pattern/iu
      );
    }
  });

  it("rejects overlong run_id values", () => {
    expect(() =>
      decodeStartPhaseRequestSync(validStart({ run_id: `r${"a".repeat(63)}` }))
    ).toThrow(/run_id|SchemaError|length|max|pattern|Pattern/iu);
  });

  it("rejects non owner/name repo refs", () => {
    expect(() =>
      decodeStartPhaseRequestSync(validStart({ repo: "agentic-loop" }))
    ).toThrow(/repo|SchemaError|pattern|Pattern/iu);
  });

  it("rejects traversal-like and malformed repo refs", () => {
    for (const repo of [
      "../repo",
      "./repo",
      "owner/..",
      "owner/.",
      "-owner/repo",
      "owner/repo/",
      "/owner/repo",
      "owner//repo",
      "owner/repo/extra",
      "owner repo/name",
      "owner/repo name",
      " owner/repo",
      "owner/repo ",
      ".owner/repo",
      "owner-/repo",
      "owner/repo with space",
      `o${"a".repeat(39)}/repo`,
      `owner/${"a".repeat(101)}`,
    ]) {
      expect(() => decodeStartPhaseRequestSync(validStart({ repo }))).toThrow(
        /repo|SchemaError|pattern|Pattern|length|max|owner|name|exactly/iu
      );
    }
  });

  it("accepts valid GitHub-style repo refs including edge punctuation", () => {
    for (const repo of [
      "v36372/agentic-loop",
      "a/b",
      "org-name/repo.name",
      "OrgName/repo_name",
      "o1/r2",
      "github/.github",
      "actions/.github",
      "owner/.hidden",
      "owner/_repo",
      "owner/-repo",
      "owner/repo-",
      "owner/repo.",
      "owner/_.",
    ]) {
      expect(decodeStartPhaseRequestSync(validStart({ repo })).repo).toBe(repo);
    }
  });

  it("rejects unknown phase values", () => {
    expect(() =>
      decodeStartPhaseRequestSync(validStart({ phase: "verifier" }))
    ).toThrow(/phase|SchemaError|Literal/u);
  });

  it("rejects attempt less than 1", () => {
    expect(() =>
      decodeStartPhaseRequestSync(
        validStart({ attempt: 0, phase: "implement" })
      )
    ).toThrow(/attempt|SchemaError|greater|filter/iu);
  });
});

describe(RunId, () => {
  it("accepts bounded safe tokens", () => {
    expect(Schema.decodeUnknownSync(RunId)("run-1")).toBe("run-1");
    expect(Schema.decodeUnknownSync(RunId)("A_b.1-x")).toBe("A_b.1-x");
  });
});

describe(RepoOwner, () => {
  it("rejects path-like and dashed-leading owners", () => {
    for (const owner of ["..", ".", "-owner", "owner-", " owner", "own er"]) {
      expect(() => Schema.decodeUnknownSync(RepoOwner)(owner)).toThrow(
        /matching|RegExp|pattern|Pattern|SchemaError/iu
      );
    }
  });
});

describe(RepoName, () => {
  it("accepts GitHub-valid names including edge punctuation", () => {
    for (const name of [
      ".github",
      "_repo",
      "-repo",
      "repo-",
      "repo.",
      "a",
      "repo.name",
    ]) {
      expect(Schema.decodeUnknownSync(RepoName)(name)).toBe(name);
    }
  });

  it("rejects bare dots, separators, whitespace, and overlength", () => {
    for (const name of [
      "..",
      ".",
      "repo/name",
      "repo name",
      "",
      "a".repeat(101),
    ]) {
      expect(() => Schema.decodeUnknownSync(RepoName)(name)).toThrow(
        /matching|RegExp|pattern|Pattern|SchemaError|length|max|NonEmpty|empty/iu
      );
    }
  });
});

describe(RepoRef, () => {
  it("accepts owner/name including .github", () => {
    expect(Schema.decodeUnknownSync(RepoRef)("v36372/agentic-loop")).toBe(
      "v36372/agentic-loop"
    );
    expect(Schema.decodeUnknownSync(RepoRef)("github/.github")).toBe(
      "github/.github"
    );
  });

  it("rejects bare name segments and extra path segments", () => {
    for (const repo of ["owner/.", "owner/..", "a/b/c", "only-owner"]) {
      expect(() => Schema.decodeUnknownSync(RepoRef)(repo)).toThrow(
        /repo|owner|name|exactly|SchemaError|pattern|Pattern/iu
      );
    }
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
