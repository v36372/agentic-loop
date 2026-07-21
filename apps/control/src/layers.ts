import {
  createInMemoryHerdrState,
  createRecordingSenderState,
  InMemoryHerdrLayer,
  RecordingPhaseCompletionSenderLayer,
} from "@agentic-loop/operator";
import type {
  InMemoryHerdrState,
  PhaseDeps,
  RecordingPhaseCompletionState,
} from "@agentic-loop/operator";
import { Layer } from "effect";

/** Explicit control phase modes for this ticket (memory only). */
export type ControlPhaseMode = "memory";

export interface MemoryPhaseLayerBundle {
  readonly herdrState: InMemoryHerdrState;
  readonly layer: Layer.Layer<PhaseDeps>;
  readonly senderState: RecordingPhaseCompletionState;
}

/**
 * Parse and validate CONTROL_PHASE_MODE.
 * Memory must be selected explicitly — missing/unknown values fail closed.
 */
export const parseControlPhaseMode = (
  raw: string | undefined
): ControlPhaseMode => {
  if (raw === "memory") {
    return "memory";
  }
  throw new Error(
    `invalid CONTROL_PHASE_MODE=${JSON.stringify(raw)}; expected "memory" (live mode is out of scope for this unit)`
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
 * Resolve the phase layer from env.
 * Requires CONTROL_PHASE_MODE=memory for this ticket's entrypoint.
 */
export const resolvePhaseLayer = (
  env: NodeJS.ProcessEnv = process.env
): {
  readonly layer: Layer.Layer<PhaseDeps>;
  readonly mode: ControlPhaseMode;
  readonly senderState: RecordingPhaseCompletionState;
} => {
  const mode = parseControlPhaseMode(env.CONTROL_PHASE_MODE);
  const memory = makeMemoryPhaseLayer();
  return {
    layer: memory.layer,
    mode,
    senderState: memory.senderState,
  };
};
