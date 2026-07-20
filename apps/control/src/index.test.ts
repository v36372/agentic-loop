import { describe, expect, it } from "vitest";

import { controlPing } from "./index.js";

describe(controlPing, () => {
  it("composes tracker and workflows through workspace boundaries", () => {
    expect(controlPing("ingress")).toBe(
      "control:ok:tracker:ok:ingress:workflows:ok:tracker:ok:ingress"
    );
  });
});
