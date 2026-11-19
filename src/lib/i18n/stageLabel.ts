import type { Cet6ContentStage } from "../types/cet";

export function stageLabelKey(stage: Cet6ContentStage): string {
  return `stageLabel.${stage}`;
}
