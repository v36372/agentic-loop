import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { promisify } from "node:util";

import {
  decodeStartPhaseRequestSync,
  runPhase,
  startPhase,
} from "@agentic-loop/operator";
import type {
  PhaseDeps,
  StartPhaseRequestType as StartPhaseRequest,
} from "@agentic-loop/operator";
import { Effect } from "effect";
import type { Layer } from "effect";

export interface PhaseBabysitFailure {
  readonly at: string;
  readonly error: string;
  readonly phase: string;
  readonly run_id: string;
}

export interface ControlHttpOptions {
  readonly babysit?: boolean;
  readonly host?: string;
  /** Durable in-process ledger of background runPhase failures. */
  readonly phaseFailures?: PhaseBabysitFailure[];
  readonly phaseLayer: Layer.Layer<PhaseDeps>;
  readonly port?: number;
}

export interface ControlHttpServer {
  readonly close: () => Promise<void>;
  readonly phaseFailures: PhaseBabysitFailure[];
  readonly server: Server;
  readonly url: string;
}

const readJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (raw.trim().length === 0) {
    return {};
  }
  return JSON.parse(raw) as unknown;
};

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json",
  });
  res.end(payload);
};

const recordFailure = (
  failures: PhaseBabysitFailure[],
  decoded: StartPhaseRequest,
  error: unknown
): void => {
  const entry: PhaseBabysitFailure = {
    at: new Date().toISOString(),
    error: String(error),
    phase: decoded.phase,
    run_id: decoded.run_id,
  };
  failures.push(entry);
  console.error(
    JSON.stringify({
      level: "error",
      msg: "runPhase failed",
      ...entry,
    })
  );
};

const forkRunPhase = (
  decoded: StartPhaseRequest,
  options: ControlHttpOptions,
  failures: PhaseBabysitFailure[]
): void => {
  void (async () => {
    try {
      await Effect.runPromise(
        runPhase(decoded).pipe(Effect.provide(options.phaseLayer))
      );
    } catch (error) {
      recordFailure(failures, decoded, error);
    }
  })();
};

const handleStartPhase = async (
  req: IncomingMessage,
  res: ServerResponse,
  options: ControlHttpOptions,
  failures: PhaseBabysitFailure[]
): Promise<void> => {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  let decoded: StartPhaseRequest;
  try {
    decoded = decodeStartPhaseRequestSync(body);
  } catch (error) {
    sendJson(res, 400, {
      detail: String(error),
      error: "invalid_start_phase_request",
    });
    return;
  }

  try {
    const accepted = await Effect.runPromise(
      startPhase(decoded).pipe(Effect.provide(options.phaseLayer))
    );
    sendJson(res, 202, accepted);

    if (options.babysit !== false) {
      forkRunPhase(decoded, options, failures);
    }
  } catch (error) {
    sendJson(res, 500, {
      detail: String(error),
      error: "start_phase_failed",
    });
  }
};

export const createControlHttpHandler =
  (
    options: ControlHttpOptions,
    failures: PhaseBabysitFailure[] = options.phaseFailures ?? []
  ) =>
  (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/healthz") {
      sendJson(res, 200, {
        last_phase_error: failures.at(-1) ?? null,
        ok: true,
        phase_failure_count: failures.length,
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/phases/start") {
      void handleStartPhase(req, res, options, failures);
      return;
    }
    sendJson(res, 404, { error: "not_found" });
  };

const listen = async (
  server: Server,
  host: string,
  port: number
): Promise<void> => {
  server.listen(port, host);
  await once(server, "listening");
};

const closeServer = async (server: Server): Promise<void> => {
  const close = promisify(server.close.bind(server));
  await close();
};

export const listenControlHttp = async (
  options: ControlHttpOptions
): Promise<ControlHttpServer> => {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const failures = options.phaseFailures ?? [];
  const handler = createControlHttpHandler(options, failures);
  const server = createServer(handler);

  await listen(server, host, port);

  const address = server.address();
  if (address === null || typeof address === "string") {
    await closeServer(server);
    throw new Error("failed to bind control HTTP server");
  }

  return {
    close: () => closeServer(server),
    phaseFailures: failures,
    server,
    url: `http://${host}:${address.port}`,
  };
};
