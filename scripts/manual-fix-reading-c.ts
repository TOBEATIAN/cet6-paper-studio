import fs from "node:fs";
import { auditCet6Stage } from "../src/lib/cet/quality/audit";
import { ExamPaperSchema } from "../src/lib/types/exam";

const paperPath = "E:\\Download\\CET-6\\working-paper.json";
const outputPath = "E:\\Download\\CET-6\\.repair-eb32c436\\reading-c.json";
const paper = ExamPaperSchema.parse(
  JSON.parse(fs.readFileSync(paperPath, "utf8")),
);
const questions = paper.questions.filter((question) => {
  const number = Number(question.examSection?.questionNumber);
  return (
    question.examSection?.kind === "cet-reading-c" &&
    number >= 46 &&
    number <= 55
  );
});

function at(number: number) {
  const question = questions.find(
    (item) => item.examSection?.questionNumber === number,
  );
  if (!question || question.type !== "single-choice") {
    throw new Error(`Missing Reading C question ${number}`);
  }
  return question;
}

function apply(
  number: number,
  correct: string,
  explanation: string,
): void {
  const question = at(number);
  question.options[question.correctAnswer] = correct;
  question.explanation = explanation;
}

apply(
  47,
  "It measured demand for fixed spaces rather than borrowing.",
  "第三段说明试点“tracked dwell time: how long people stayed and how well they used fixed spaces”，即关注停留时间与固定空间的使用需求，而不是借书量。A) 正确项：fixed spaces 对应固定空间，rather than borrowing 对应“不是借书量”，且没有照搬完整句，故为答案。B) 错误类型：张冠李戴。原文的 dwell time 是停留时间指标，本题并不是统计借书量。C) 错误类型：无中生有。原文没有测量员工在地方会议上的出勤。D) 错误类型：偷换范围。原文没有比较附近城镇的晚间使用。故选 A。",
);

apply(
  48,
  "It merged fresh evidence with conventional borrowing data.",
  "第五段先说明记分卡统计到访、长时停留、活动参与和员工协助，随后又保留“alongside conventional borrowing”这一传统数字证据，即在传统借阅数据之外加入新证据。A) 正确项：fresh evidence 指新增使用证据，conventional borrowing data 指保留的传统借阅数据，故为答案。B) 错误类型：与原文相悖。原文保留 circulation，而非换成纯定性记录。C) 错误类型：程度偏移。原文要求谨慎解释季节节奏，并未说其无关。D) 错误类型：无中生有。原文没有把员工协助排在所有传统财务信号之上。故选 A。",
);

apply(
  50,
  "They keep familiar circulation totals but miss broader public value.",
  "第八段说议员索要 circulation totals，因为“circulation totals because those figures are simpler to explain and easier to compare”，而第六段 Calder 指出图书馆真正的产出是 attention，不是交易。A) 错误类型：程度偏移。可比较性被夸成唯一可靠证据。B) 错误类型：半对半错。easier to compare 成立，但 fully capture 注意力错误。C) 正确项：familiar circulation totals 对应议员熟悉的传统指标，miss broader public value 概括忽略关系性公共价值，故为答案。D) 错误类型：无中生有。原文主张混合指标，没有说以流通总量取代全部新记录。故选 C。",
);

const report = auditCet6Stage("reading-c", questions);
if (!report.passed) {
  console.error(JSON.stringify(report.errors, null, 2));
  process.exit(1);
}
const temporary = `${outputPath}.tmp`;
fs.writeFileSync(temporary, JSON.stringify(questions, null, 2), "utf8");
fs.renameSync(temporary, outputPath);
console.log(`[manual] reading-c saved: ${questions.length}`);
