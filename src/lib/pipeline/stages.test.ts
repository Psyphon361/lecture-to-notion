import { describe, expect, it } from "vitest";

import {
  advanceStages,
  initialStages,
  stagesComplete,
} from "@/lib/pipeline/stages";

describe("pipeline stages", () => {
  it("starts on extract and finishes only after every stage", () => {
    let stages = initialStages();
    expect(stages.map((stage) => stage.status)).toEqual([
      "active",
      "pending",
      "pending",
      "pending",
    ]);

    let steps = 0;
    while (!stagesComplete(stages)) {
      stages = advanceStages(stages);
      steps += 1;
      expect(steps).toBeLessThan(10);
    }

    expect(steps).toBe(4);
    expect(stages.every((stage) => stage.status === "done")).toBe(true);
    expect(advanceStages(stages)).toEqual(stages);
  });
});
