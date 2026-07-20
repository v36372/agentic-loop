import { describe, expect, it } from "vitest";

import { workflowsPing } from "./index.js";

describe(workflowsPing, () => {
  it("composes tracker through the workspace boundary", () => {
    expect(workflowsPing("triage")).toBe("workflows:ok:tracker:ok:triage");
  });
});
