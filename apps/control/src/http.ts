import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { promisify } from "node:util";

import {
  decodeStartPhaseRequestSync,
  isRunIdentityConflictError,
  runPhase,
  startPhase,
} from "@agentic-loop/operator";
import type {
  PhaseDeps,
  StartPhaseRequestType as StartPhaseRequest,
} from "@agentic-loop/operator";
import { Effect } from "effect";
import type { Layer } from "effect";

/** Maximum background failure entries retained for diagnostics. */
export const MAX_PHASE_FAILURES = 32;

/** Maximum accepted JSON body size for control write routes. */
export const MAX_START_PHASE_BODY_BYTES = 64 * 1024;

export interface PhaseBabysitFailure {
  readonly at: string;
  readonly error: string;
  readonly phase: string;
  readonly run_id: string;
}

export interface ControlHttpOptions {
  readonly babysit?: boolean;
  readonly host?: string;
  /** Bounded in-process ledger of background runPhase failures. */
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

export interface ControlHealthz {
  readonly degraded: boolean;
  readonly last_phase_error: PhaseBabysitFailure | null;
  readonly ok: true;
  readonly phase_failure_count: number;
}

class PayloadTooLargeError extends Error {
  readonly _tag = "PayloadTooLargeError" as const;
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`request body exceeds ${maxBytes} bytes`);
    this.name = "PayloadTooLargeError";
    this.maxBytes = maxBytes;
  }
}

const isPayloadTooLargeError = (
  error: unknown
): error is PayloadTooLargeError =>
  error instanceof PayloadTooLargeError ||
  (typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "PayloadTooLargeError");

/** Snapshot health/diagnostics from the bounded failure ledger. */
export const healthzFromFailures = (
  failures: readonly PhaseBabysitFailure[]
): ControlHealthz => ({
  degraded: failures.length > 0,
  last_phase_error: failures.at(-1) ?? null,
  ok: true,
  phase_failure_count: failures.length,
});

const drainRequest = (req: IncomingMessage): void => {
  req.resume();
};

const readJsonBody = async (
  req: IncomingMessage,
  maxBytes: number
): Promise<unknown> => {
  const contentLengthHeader = req.headers["content-length"];
  if (contentLengthHeader !== undefined) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      drainRequest(req);
      throw new PayloadTooLargeError(maxBytes);
    }
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      drainRequest(req);
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(buf);
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
  while (failures.length > MAX_PHASE_FAILURES) {
    failures.shift();
  }
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
  // Detached babysit owned by the control process; failures land in the ledger.
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
    body = await readJsonBody(req, MAX_START_PHASE_BODY_BYTES);
  } catch (error) {
    if (isPayloadTooLargeError(error)) {
      sendJson(res, 413, {
        detail: String(error),
        error: "payload_too_large",
        max_bytes: MAX_START_PHASE_BODY_BYTES,
      });
      return;
    }
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
    if (isRunIdentityConflictError(error)) {
      sendJson(res, 409, {
        detail: String(error),
        error: "run_identity_conflict",
      });
      return;
    }
    sendJson(res, 500, {
      detail: String(error),
      error: "start_phase_failed",
    });
  }
};

/** Build the Node HTTP request handler for control routes. */
export const createControlHttpHandler =
  (
    options: ControlHttpOptions,
    failures: PhaseBabysitFailure[] = options.phaseFailures ?? []
  ) =>
  (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/healthz") {
      sendJson(res, 200, healthzFromFailures(failures));
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

/** Bind control HTTP and return a closable server handle. */
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
