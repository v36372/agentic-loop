import { describe, expect, it } from "vitest";

import {
  makeMemoryPhaseLayer,
  parseControlPhaseMode,
  resolvePhaseLayer,
} from "./layers.js";

describe(parseControlPhaseMode, () => {
  it("requires explicit memory mode", () => {
    expect(parseControlPhaseMode("memory")).toBe("memory");
  });

  it("rejects missing mode instead of silent memory default", () => {
    expect(() => parseControlPhaseMode()).toThrow(
      /invalid CONTROL_PHASE_MODE/u
    );
  });

  it("rejects unknown modes fail-closed", () => {
    expect(() => parseControlPhaseMode("live")).toThrow(
      /invalid CONTROL_PHASE_MODE/u
    );
    expect(() => parseControlPhaseMode("prod")).toThrow(
      /invalid CONTROL_PHASE_MODE/u
    );
    expect(() => parseControlPhaseMode("")).toThrow(
      /invalid CONTROL_PHASE_MODE/u
    );
  });
});

describe(makeMemoryPhaseLayer, () => {
  it("builds a merged memory layer bundle", () => {
    const bundle = makeMemoryPhaseLayer();
    expect(bundle.herdrState.agents.size).toBe(0);
    expect(bundle.senderState.events).toHaveLength(0);
    expect(bundle.layer).toBeDefined();
  });
});

describe(resolvePhaseLayer, () => {
  it("builds a memory layer only when mode is explicit", () => {
    const resolved = resolvePhaseLayer({ CONTROL_PHASE_MODE: "memory" });
    expect(resolved.mode).toBe("memory");
    expect(resolved.senderState.events).toHaveLength(0);
  });

  it("fails closed for missing mode instead of silent memory", () => {
    expect(() => resolvePhaseLayer({})).toThrow(/invalid CONTROL_PHASE_MODE/u);
  });

  it("fails closed for unknown mode instead of silent memory", () => {
    expect(() => resolvePhaseLayer({ CONTROL_PHASE_MODE: "staging" })).toThrow(
      /invalid CONTROL_PHASE_MODE/u
    );
  });
});
