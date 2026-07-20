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

export { createControlHttpHandler, listenControlHttp } from "./http.js";
export {
  makeLivePhaseLayer,
  makeMemoryPhaseLayer,
  parseControlPhaseMode,
  resolvePhaseLayer,
} from "./layers.js";

/**
 * Start control HTTP when executed as the app entrypoint.
 * Default mode is `memory` for local dev; unknown modes fail closed.
 * Live mode requires PHASE_COMPLETION_URL.
 */
export const main = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<void> => {
  const { layer: phaseLayer, mode } = resolvePhaseLayer(env);
  const host = env.CONTROL_HOST ?? "127.0.0.1";
  const port = Number(env.CONTROL_PORT ?? "8787");
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
