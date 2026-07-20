import {
  createInMemoryHerdrState,
  createRecordingSenderState,
  HerdrCliLayer,
  HttpPhaseCompletionSenderLayer,
  InMemoryHerdrLayer,
  RecordingPhaseCompletionSenderLayer,
} from "@agentic-loop/operator";
import type {
  InMemoryHerdrState,
  PhaseDeps,
  RecordingPhaseCompletionState,
} from "@agentic-loop/operator";
import { Layer } from "effect";

export type ControlPhaseMode = "live" | "memory";

export interface MemoryPhaseLayerBundle {
  readonly herdrState: InMemoryHerdrState;
  readonly layer: Layer.Layer<PhaseDeps>;
  readonly senderState: RecordingPhaseCompletionState;
}

/** Parse and validate CONTROL_PHASE_MODE. Unknown values fail closed. */
export const parseControlPhaseMode = (
  raw: string | undefined
): ControlPhaseMode => {
  const mode = raw ?? "memory";
  if (mode === "memory" || mode === "live") {
    return mode;
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
 * Live layer: Herdr CLI + HTTP/Inngest completion sink.
 * Requires PHASE_COMPLETION_URL (fail closed if missing/empty).
 */
export const makeLivePhaseLayer = (
  env: NodeJS.ProcessEnv = process.env
): Layer.Layer<PhaseDeps> => {
  const completionUrl = env.PHASE_COMPLETION_URL?.trim();
  if (!completionUrl) {
    throw new Error(
      "PHASE_COMPLETION_URL is required when CONTROL_PHASE_MODE=live"
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(completionUrl);
  } catch {
    throw new Error(
      `PHASE_COMPLETION_URL is not a valid URL: ${JSON.stringify(completionUrl)}`
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `PHASE_COMPLETION_URL must be http(s), got ${parsed.protocol}`
    );
  }
  return Layer.merge(
    HerdrCliLayer({ herdrBin: env.HERDR_BIN ?? "herdr" }),
    HttpPhaseCompletionSenderLayer({ url: completionUrl })
  );
};

export const resolvePhaseLayer = (
  env: NodeJS.ProcessEnv = process.env
): {
  readonly layer: Layer.Layer<PhaseDeps>;
  readonly mode: ControlPhaseMode;
} => {
  const mode = parseControlPhaseMode(env.CONTROL_PHASE_MODE);
  if (mode === "live") {
    return { layer: makeLivePhaseLayer(env), mode };
  }
  return { layer: makeMemoryPhaseLayer().layer, mode };
};
