import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { controlPing } from "./index.js";

describe(controlPing, () => {
  it("composes tracker and workflows through workspace boundaries", () => {
    expect(controlPing("ingress")).toBe(
      "control:ok:tracker:ok:ingress:workflows:ok:tracker:ok:ingress"
    );
  });
});

const pollHealthz = async (
  url: string,
  deadline: number
): Promise<
  | {
      degraded: boolean;
      last_phase_error: null;
      ok: boolean;
      phase_failure_count: number;
    }
  | undefined
> => {
  if (Date.now() >= deadline) {
    return undefined;
  }
  try {
    const response = await fetch(url);
    if (response.status === 200) {
      return (await response.json()) as {
        degraded: boolean;
        last_phase_error: null;
        ok: boolean;
        phase_failure_count: number;
      };
    }
  } catch {
    // process still binding
  }
  await delay(50);
  return pollHealthz(url, deadline);
};

describe("control start smoke", () => {
  it("starts via the package start script and serves GET /healthz", async () => {
    const controlRoot = fileURLToPath(new URL("..", import.meta.url));
    const port = 18_787;
    const child = spawn("pnpm", ["run", "start:memory"], {
      cwd: controlRoot,
      env: {
        ...process.env,
        CONTROL_BABYSIT: "0",
        CONTROL_HOST: "127.0.0.1",
        CONTROL_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    const stop = async (): Promise<void> => {
      if (child.exitCode !== null || child.killed) {
        return;
      }
      child.kill("SIGTERM");
      await Promise.race([
        once(child, "exit"),
        delay(2000).then(() => {
          child.kill("SIGKILL");
        }),
      ]);
    };

    try {
      const body = await pollHealthz(
        `http://127.0.0.1:${port}/healthz`,
        Date.now() + 8000
      );
      if (child.exitCode !== null) {
        throw new Error(
          `control exited early (${child.exitCode}): ${stdout}\n${stderr}`
        );
      }
      expect({
        body,
        stdoutHasListening: /control listening/u.test(stdout),
      }).toStrictEqual({
        body: {
          degraded: false,
          last_phase_error: null,
          ok: true,
          phase_failure_count: 0,
        },
        stdoutHasListening: true,
      });
    } finally {
      await stop();
    }
  });
});
