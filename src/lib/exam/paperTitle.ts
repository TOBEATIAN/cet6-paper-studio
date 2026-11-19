import type { Cet6ContentStage, SpecialtyStageTopics } from "../types/cet";
import { CET6_STAGE_SPECS } from "../cet/structure";

/** CET-6 default title: year/month/day + paper name. */
export function createCet6PaperTitle(date = new Date()): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日六级模拟卷`;
}

export function createSpecialtyPaperTitle(
  date: Date,
  stages: readonly Cet6ContentStage[],
  topics: SpecialtyStageTopics,
): string {
  const labels = stages.map((stage) => CET6_STAGE_SPECS[stage].labelZh);
  const topicValues = stages.flatMap((stage) =>
    stage === "reading-c"
      ? [topics["reading-c"].first.trim(), topics["reading-c"].second.trim()]
      : [topics[stage].trim()],
  ).filter(Boolean);
  const topic =
    topicValues.length === 0
      ? ""
      : topicValues.length === 1
        ? ` · ${topicValues[0]}`
        : " · 多主题";
  return `${formatTitleDate(date)} 六级专项 ${labels.join("+")}${topic}`;
}

export function specialtyTopicSummary(
  stages: readonly Cet6ContentStage[],
  topics: SpecialtyStageTopics,
): string {
  return stages
    .flatMap((stage) =>
      stage === "reading-c"
        ? [
            topics["reading-c"].first.trim()
              ? `阅读C一：${topics["reading-c"].first.trim()}`
              : "",
            topics["reading-c"].second.trim()
              ? `阅读C二：${topics["reading-c"].second.trim()}`
              : "",
          ]
        : topics[stage].trim()
          ? `${CET6_STAGE_SPECS[stage].labelZh}：${topics[stage].trim()}`
          : [],
    )
    .filter(Boolean)
    .join("；");
}

function formatTitleDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function isCet6TimestampTitle(title: string): boolean {
  return /^\d{4}年\d{1,2}月\d{1,2}日六级模拟卷$/.test(
    title.trim(),
  );
}
