import { readFileSync } from "node:fs";
import type { ExamPaper } from "../src/lib/types/exam";
import { countSpokenWords } from "../src/lib/tts/audio";
import { buildListeningSpeechPlan } from "../src/lib/tts/plan";

const path =
  process.argv[2] ?? "E:\\Download\\CET-6\\working-paper.json";
const paper = JSON.parse(readFileSync(path, "utf8")) as ExamPaper;
const targetWpm = Number(process.argv[3] ?? 170);
const plan = buildListeningSpeechPlan(paper, targetWpm);
const spokenWords = plan.segments.reduce(
  (sum, segment) => sum + countSpokenWords(segment.text),
  0,
);
const answerPauseMs = plan.segments
  .filter((segment) => segment.pauseAfterMs === 13_100)
  .reduce((sum, segment) => sum + segment.pauseAfterMs, 0);
const finishedAt = new Date().toISOString();
console.log(
  JSON.stringify(
    {
      finishedAt,
      targetWpm,
      segments: plan.segments.length,
      spokenWords,
      answerPauseMs,
      questionPauses: plan.segments.filter(
        (segment) => segment.pauseAfterMs === 13_100,
      ).length,
      announcements: plan.segments.filter((segment) =>
        segment.id.endsWith("-announcement"),
      ).length,
      titles: plan.segments
        .filter((segment) => segment.id.endsWith("-title"))
        .map((segment) => ({
          text: segment.text,
          pauseAfterMs: segment.pauseAfterMs,
        })),
      estimatedTotalMs:
        Math.round((spokenWords * 60_000) / targetWpm) + answerPauseMs,
    },
    null,
    2,
  ),
);
