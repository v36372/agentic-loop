import { describe, expect, it } from "vitest";

import {
  makeLivePhaseLayer,
  parseControlPhaseMode,
  resolvePhaseLayer,
} from "./layers.js";

describe(parseControlPhaseMode, () => {
  it("defaults missing mode to memory", () => {
    expect(parseControlPhaseMode()).toBe("memory");
  });

  it("accepts memory and live", () => {
    expect(parseControlPhaseMode("memory")).toBe("memory");
    expect(parseControlPhaseMode("live")).toBe("live");
  });

  it("rejects unknown modes fail-closed", () => {
    expect(() => parseControlPhaseMode("prod")).toThrow(
      /invalid CONTROL_PHASE_MODE/u
    );
    expect(() => parseControlPhaseMode("")).toThrow(
      /invalid CONTROL_PHASE_MODE/u
    );
  });
});

describe(makeLivePhaseLayer, () => {
  it("requires PHASE_COMPLETION_URL", () => {
    expect(() => makeLivePhaseLayer({})).toThrow(/PHASE_COMPLETION_URL/u);
  });

  it("rejects invalid completion URLs", () => {
    expect(() =>
      makeLivePhaseLayer({ PHASE_COMPLETION_URL: "not-a-url" })
    ).toThrow(/valid URL/u);
  });
});

describe(resolvePhaseLayer, () => {
  it("builds a memory layer by default", () => {
    const resolved = resolvePhaseLayer({});
    expect(resolved.mode).toBe("memory");
  });

  it("fails closed for unknown mode instead of silent memory", () => {
    expect(() => resolvePhaseLayer({ CONTROL_PHASE_MODE: "staging" })).toThrow(
      /invalid CONTROL_PHASE_MODE/u
    );
  });
});
