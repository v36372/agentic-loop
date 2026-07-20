import { describe, expect, it } from "vitest";

import { trackerPing } from "./index.js";

describe(trackerPing, () => {
  it("returns a package-scoped ok marker", () => {
    expect(trackerPing("board")).toBe("tracker:ok:board");
  });
});
