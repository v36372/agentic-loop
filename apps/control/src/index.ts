import { trackerPing } from "@agentic-loop/tracker";
import { workflowsPing } from "@agentic-loop/workflows";
import { Effect } from "effect";

import { listenControlHttp } from "./http.js";
import { resolvePhaseLayer } from "./layers.js";

/** Placeholder identity for the control-plane ingress app. */
export const controlPing = (name: string): string => {
  const board = trackerPing(name);
  const flow = workflowsPing(name);
  return Effect.runSync(Effect.succeed(`control:ok:${board}:${flow}`));
};

export {
  createControlHttpHandler,
  healthzFromFailures,
  listenControlHttp,
  MAX_PHASE_FAILURES,
} from "./http.js";
export type {
  ControlHealthz,
  ControlHttpOptions,
  ControlHttpServer,
  PhaseBabysitFailure,
} from "./http.js";
export {
  makeLivePhaseLayer,
  makeMemoryPhaseLayer,
  parseControlPhaseMode,
  resolvePhaseLayer,
} from "./layers.js";
export type {
  ControlPhaseMode,
  LivePhaseLayerBundle,
  MemoryPhaseLayerBundle,
} from "./layers.js";

/**
 * Start control HTTP when executed as the app entrypoint.
 * Requires explicit CONTROL_PHASE_MODE=memory|live (no silent default).
 */
export const main = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<void> => {
  const { layer: phaseLayer, mode } = resolvePhaseLayer(env);
  const host = env.CONTROL_HOST ?? "127.0.0.1";
  const port = Number(env.CONTROL_PORT ?? "8787");
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(
      `invalid CONTROL_PORT=${JSON.stringify(env.CONTROL_PORT)}; expected 0-65535`
    );
  }
  const server = await listenControlHttp({
    babysit: env.CONTROL_BABYSIT !== "0",
    host,
    phaseLayer,
    port,
  });
  console.log(
    JSON.stringify({
      level: "info",
      msg: "control listening",
      phase_mode: mode,
      url: server.url,
    })
  );
};

const isEntrypoint = (): boolean => {
  const [entry] = process.argv.slice(1);
  if (!entry) {
    return false;
  }
  return (
    entry.endsWith("/apps/control/src/index.ts") ||
    entry.endsWith("/apps/control/src/index.js") ||
    entry.endsWith("/apps/control/dist/index.js") ||
    entry.includes("@agentic-loop/control")
  );
};

if (isEntrypoint()) {
  try {
    await main();
  } catch (error) {
    console.error(
      JSON.stringify({
        error: String(error),
        level: "error",
        msg: "control failed to start",
      })
    );
    process.exitCode = 1;
  }
}
