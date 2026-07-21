import {
  createInMemoryHerdrState,
  createRecordingSenderState,
  HerdrCliLayer,
  InMemoryHerdrLayer,
  RecordingPhaseCompletionSenderLayer,
} from "@agentic-loop/operator";
import type {
  InMemoryHerdrState,
  PhaseDeps,
  RecordingPhaseCompletionState,
} from "@agentic-loop/operator";
import { Layer } from "effect";

/** Explicit control phase modes: memory (tests/dev) or live Herdr CLI. */
export type ControlPhaseMode = "live" | "memory";

export interface MemoryPhaseLayerBundle {
  readonly herdrState: InMemoryHerdrState;
  readonly layer: Layer.Layer<PhaseDeps>;
  readonly senderState: RecordingPhaseCompletionState;
}

export interface LivePhaseLayerBundle {
  readonly layer: Layer.Layer<PhaseDeps>;
  readonly senderState: RecordingPhaseCompletionState;
}

/**
 * Parse and validate CONTROL_PHASE_MODE.
 * Mode must be selected explicitly — missing/unknown values fail closed.
 * Live mode uses Herdr CLI; completion sink remains process-local recording
 * until HTTP/Inngest delivery lands in #23.
 */
export const parseControlPhaseMode = (
  raw: string | undefined
): ControlPhaseMode => {
  if (raw === "memory" || raw === "live") {
    return raw;
  }
  throw new Error(
    `invalid CONTROL_PHASE_MODE=${JSON.stringify(raw)}; expected "memory" | "live"`
  );
};

/** Test/dev layer: in-memory Herdr + recording completion sender. */
export const makeMemoryPhaseLayer = (): MemoryPhaseLayerBundle => {
  const herdrState = createInMemoryHerdrState();
  const senderState = createRecordingSenderState();
  return {
    herdrState,
    layer: Layer.merge(
      InMemoryHerdrLayer(herdrState),
      RecordingPhaseCompletionSenderLayer(senderState)
    ),
    senderState,
  };
};

/**
 * Live layer: Herdr CLI + recording completion sender.
 * Full HTTP completion delivery is issue #23; recording keeps the same
 * `herdr/phase.completed` contract and process-local idempotency for now.
 */
export const makeLivePhaseLayer = (
  env: NodeJS.ProcessEnv = process.env
): LivePhaseLayerBundle => {
  const senderState = createRecordingSenderState();
  return {
    layer: Layer.merge(
      HerdrCliLayer({ herdrBin: env.HERDR_BIN ?? "herdr" }),
      RecordingPhaseCompletionSenderLayer(senderState)
    ),
    senderState,
  };
};

/**
 * Resolve the phase layer from env.
 * Requires explicit CONTROL_PHASE_MODE=memory|live.
 */
export const resolvePhaseLayer = (
  env: NodeJS.ProcessEnv = process.env
): {
  readonly layer: Layer.Layer<PhaseDeps>;
  readonly mode: ControlPhaseMode;
  readonly senderState: RecordingPhaseCompletionState;
} => {
  const mode = parseControlPhaseMode(env.CONTROL_PHASE_MODE);
  if (mode === "live") {
    const live = makeLivePhaseLayer(env);
    return {
      layer: live.layer,
      mode,
      senderState: live.senderState,
    };
  }
  const memory = makeMemoryPhaseLayer();
  return {
    layer: memory.layer,
    mode,
    senderState: memory.senderState,
  };
};
