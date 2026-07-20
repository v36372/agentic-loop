import { describe, expect, it } from "vitest";

import { operatorPing } from "./index.js";

describe(operatorPing, () => {
  it("returns a package-scoped ok marker", () => {
    expect(operatorPing("phase")).toBe("operator:ok:phase");
  });
});
