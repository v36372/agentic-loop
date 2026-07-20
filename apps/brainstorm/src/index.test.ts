import { describe, expect, it } from "vitest";

import { brainstormPing } from "./index.js";

describe(brainstormPing, () => {
  it("uses tracker only through the workspace boundary", () => {
    expect(brainstormPing("chat")).toBe("brainstorm:ok:tracker:ok:chat");
  });
});
