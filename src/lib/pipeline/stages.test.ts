import { describe, expect, it } from "vitest";

import {
  advanceStages,
  initialStages,
  stagesAfterAnalyze,
  stagesAfterExtract,
  stagesAfterStructure,
  stagesAfterStructureStopped,
  stagesComplete,
  stagesWhileAnalyzing,
  stagesWhileStructuring,
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

  it("finishes structuring while organize still has not started", () => {
    const structuring = stagesWhileStructuring();
    expect(structuring.map((stage) => stage.status)).toEqual(["done", "done", "active", "pending"]);
    expect(structuring[3]?.detail).toBe("Has not started.");

    const done = stagesAfterStructure();
    expect(done.map((stage) => stage.status)).toEqual(["done", "done", "done", "pending"]);
    expect(done[3]?.detail).toBe("Has not started.");

    const stopped = stagesAfterStructureStopped();
    expect(stopped.map((stage) => stage.status)).toEqual(["done", "done", "pending", "pending"]);
    expect(stopped[2]?.detail).toBe("Stopped before every slide was structured.");
    expect(stopped[3]?.detail).toBe("Has not started.");
  });
});
