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
