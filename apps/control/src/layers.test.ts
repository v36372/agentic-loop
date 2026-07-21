import { describe, expect, it } from "vitest";

import {
  makeLivePhaseLayer,
  makeMemoryPhaseLayer,
  parseControlPhaseMode,
  resolvePhaseLayer,
} from "./layers.js";

describe(parseControlPhaseMode, () => {
  it("accepts explicit memory and live modes", () => {
    expect(parseControlPhaseMode("memory")).toBe("memory");
    expect(parseControlPhaseMode("live")).toBe("live");
  });

  it("rejects missing mode instead of silent memory default", () => {
    expect(() => parseControlPhaseMode()).toThrow(
      /invalid CONTROL_PHASE_MODE/u
    );
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

describe(makeMemoryPhaseLayer, () => {
  it("builds a merged memory layer bundle", () => {
    const bundle = makeMemoryPhaseLayer();
    expect(bundle.herdrState.agents.size).toBe(0);
    expect(bundle.senderState.events).toHaveLength(0);
    expect(bundle.layer).toBeDefined();
  });
});

describe(makeLivePhaseLayer, () => {
  it("builds a live Herdr CLI layer with recording sender", () => {
    const bundle = makeLivePhaseLayer({});
    expect(bundle.senderState.events).toHaveLength(0);
    expect(bundle.layer).toBeDefined();
  });

  it("honors HERDR_BIN without requiring a completion URL yet", () => {
    const bundle = makeLivePhaseLayer({ HERDR_BIN: "herdr-custom" });
    expect(bundle.layer).toBeDefined();
  });
});

describe(resolvePhaseLayer, () => {
  it("builds a memory layer only when mode is explicit", () => {
    const resolved = resolvePhaseLayer({ CONTROL_PHASE_MODE: "memory" });
    expect(resolved.mode).toBe("memory");
    expect(resolved.senderState.events).toHaveLength(0);
  });

  it("builds a live layer when mode is live", () => {
    const resolved = resolvePhaseLayer({ CONTROL_PHASE_MODE: "live" });
    expect(resolved.mode).toBe("live");
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
