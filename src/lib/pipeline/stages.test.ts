import { describe, expect, it } from "vitest";

import {
  advanceStages,
  initialStages,
  stagesAfterAnalyze,
  stagesAfterExtract,
  stagesComplete,
  stagesWhileAnalyzing,
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

  it("marks extract done and leaves the later stages unstarted", () => {
    const stages = stagesAfterExtract();
    expect(stages.map((stage) => stage.status)).toEqual([
      "done",
      "pending",
      "pending",
      "pending",
    ]);
    expect(stages.slice(1).every((stage) => stage.detail === "Has not started.")).toBe(
      true,
    );
  });

  it("keeps structure and organize unstarted after image analysis", () => {
    const analyzing = stagesWhileAnalyzing();
    expect(analyzing.map((stage) => stage.status)).toEqual([
      "done",
      "active",
      "pending",
      "pending",
    ]);
    expect(analyzing.slice(2).every((stage) => stage.detail === "Has not started.")).toBe(true);

    const done = stagesAfterAnalyze();
    expect(done.map((stage) => stage.status)).toEqual(["done", "done", "pending", "pending"]);
    expect(done.slice(2).every((stage) => stage.detail === "Has not started.")).toBe(true);
  });
});
