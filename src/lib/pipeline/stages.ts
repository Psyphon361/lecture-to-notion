export const PIPELINE_STAGES = [
  {
    id: "parse",
    label: "Extract slides",
    detail: "Read text, images, and layout from the PowerPoint.",
  },
  {
    id: "analyze-images",
    label: "Analyze images",
    detail: "Skip decorative images. Read diagrams and screenshots.",
  },
  {
    id: "process-slides",
    label: "Structure each slide",
    detail: "Turn each slide into notes without dropping detail.",
  },
  {
    id: "organize",
    label: "Organize notes",
    detail: "Combine slide notes into one document.",
  },
] as const;

export type StageId = (typeof PIPELINE_STAGES)[number]["id"];
export type StageStatus = "pending" | "active" | "done";

export interface StageState {
  id: StageId;
  label: string;
  detail: string;
  status: StageStatus;
}

export function initialStages(): StageState[] {
  return PIPELINE_STAGES.map((stage, index) => ({
    id: stage.id,
    label: stage.label,
    detail: stage.detail,
    status: index === 0 ? "active" : "pending",
  }));
}

export function advanceStages(stages: StageState[]): StageState[] {
  const activeIndex = stages.findIndex((stage) => stage.status === "active");
  if (activeIndex === -1) return stages;
  return stages.map((stage, index) => {
    if (index === activeIndex) return { ...stage, status: "done" };
    if (index === activeIndex + 1) return { ...stage, status: "active" };
    return stage;
  });
}

export function stagesComplete(stages: StageState[]): boolean {
  return stages.every((stage) => stage.status === "done");
}

/** Extract finished. Later stages stay pending until their own requests exist. */
export function stagesAfterExtract(): StageState[] {
  return PIPELINE_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    detail: stage.id === "parse" ? stage.detail : "Has not started.",
    status: stage.id === "parse" ? "done" : "pending",
  }));
}

/** Extract finished and image analysis is in progress. Later stages have not started. */
export function stagesWhileAnalyzing(): StageState[] {
  return PIPELINE_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    detail:
      stage.id === "parse" || stage.id === "analyze-images" ? stage.detail : "Has not started.",
    status:
      stage.id === "parse" ? "done" : stage.id === "analyze-images" ? "active" : "pending",
  }));
}

/** Extract and image analysis finished. Structure and organize have not started. */
export function stagesAfterAnalyze(): StageState[] {
  return PIPELINE_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    detail:
      stage.id === "process-slides" || stage.id === "organize" ? "Has not started." : stage.detail,
    status: stage.id === "parse" || stage.id === "analyze-images" ? "done" : "pending",
  }));
}

/** Image analysis finished. Structuring is in progress. Organize has not started. */
export function stagesWhileStructuring(): StageState[] {
  return PIPELINE_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    detail: stage.id === "organize" ? "Has not started." : stage.detail,
    status:
      stage.id === "parse" || stage.id === "analyze-images"
        ? "done"
        : stage.id === "process-slides"
          ? "active"
          : "pending",
  }));
}

/** Every slide returned notes. Organize has not started. */
export function stagesAfterStructure(): StageState[] {
  return PIPELINE_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    detail: stage.id === "organize" ? "Has not started." : stage.detail,
    status: stage.id === "organize" ? "pending" : "done",
  }));
}

/** Structuring stopped before every slide returned. Organize has not started. */
export function stagesAfterStructureStopped(): StageState[] {
  return PIPELINE_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    detail:
      stage.id === "organize"
        ? "Has not started."
        : stage.id === "process-slides"
          ? "Stopped before every slide was structured."
          : stage.detail,
    status: stage.id === "parse" || stage.id === "analyze-images" ? "done" : "pending",
  }));
}
