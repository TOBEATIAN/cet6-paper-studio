import fs from "node:fs";
import path from "node:path";
import { auditCet6Stage } from "../src/lib/cet/quality/audit";
import { ExamPaperSchema } from "../src/lib/types/exam";

const paperPath = "E:\\Download\\CET-6\\working-paper.json";
const outputPath = "E:\\Download\\CET-6\\.repair-eb32c436\\listening-b.json";
const paper = ExamPaperSchema.parse(JSON.parse(fs.readFileSync(paperPath, "utf8")));
const questions = paper.questions.filter(
  (question) => question.examSection?.kind === "cet-listening-b",
);

function at(number: number) {
  const question = questions.find(
    (item) => item.examSection?.questionNumber === number,
  );
  if (!question || question.type !== "single-choice") {
    throw new Error(`Missing Listening B question ${number}`);
  }
  return question;
}

function apply(
  number: number,
  options: string[],
  correctAnswer: number,
  explanation: string,
): void {
  const question = at(number);
  question.options = options;
  question.correctAnswer = correctAnswer;
  question.explanation = explanation;
}

apply(
  9,
  [
    "To sell donated tools at low prices to students",
    "To reduce duplicate purchases and encourage repair among students",
    "To train students as professional carpenters on campus",
    "To replace the campus facilities office",
  ],
  1,
  "原文说明该借用台的主要目的是“to reduce duplicate purchases and encourage repair rather than disposal”，即减少重复购买并鼓励维修，故 B 项正确。A) 错误类型：与原文相悖。原文明确说“does not sell tools”。C) 错误类型：程度偏移。原文只让有经验的学生和当地志愿者演示维修，并未培养专业木匠。D) 错误类型：无中生有。设施部门只提供储存空间，未被取代。故选 B。",
);

apply(
  10,
  [
    "Returned tools had loose handles and missing screws",
    "Many donated tools were too old to lend safely",
    "Local repair shops offered free training to volunteers",
    "The student center demanded regular publicity for activities",
  ],
  0,
  "原文说“a growing number of returned tools had loose handles, blunt blades, or missing screws”，随后团队决定设置每月维修工作坊，故 A 项正确。B) 错误类型：无中生有。原文没有说捐赠工具因太旧而不能出借。C) 错误类型：张冠李戴。培训者是学生和当地志愿者，不是当地维修店。D) 错误类型：无中生有。学生中心只涉及宣传需求，没有作为设立工作坊的原因。故选 A。",
);

apply(
  11,
  [
    "The borrowing period is too short for real projects",
    "Borrowers worry about breakage and blame",
    "Volunteers ask too many personal questions about users",
    "Tools are stored too far from student dormitories",
  ],
  1,
  "原文指出“Some students still hesitate to borrow tools because they worry about damage”，并补充“borrowers should report breakage immediately”，说明学生担心损坏及责任，故 B 项正确。A) 错误类型：无中生有。工具可借一周，并未被描述为太短。C) 错误类型：无中生有。志愿者没有询问过多私人问题。D) 错误类型：无中生有。地点距宿舍远近没有被列为顾虑。故选 B。",
);

apply(
  12,
  [
    "Batteries should never be replaced at home by users",
    "Safety concerns are usually exaggerated by designers",
    "Water resistance matters more than repair options",
    "Repairs require training and careful handling",
  ],
  3,
  "原文明确说“Repairs require training and careful handling, not simply a video and a screwdriver”，强调电池维修需要培训与谨慎操作，故 D 项正确。A) 错误类型：程度偏移。原文警告非培训更换可能起火，并未绝对禁止在家更换。B) 错误类型：与原文相悖。原文承认锂电池确实危险。C) 错误类型：半对半错。防水与安全是权衡因素，但原文没有断言防水比维修更重要。故选 D。",
);

apply(
  13,
  [
    "They increase the initial purchase price considerably",
    "They shorten the device's expected working lifespan",
    "They make cell replacement unnecessarily difficult",
    "They prevent water-resistant designs from succeeding entirely",
  ],
  2,
  "原文指出密封电池使“replacing it becomes unnecessarily difficult”，即更换电芯异常困难，故 C 项正确。A) 错误类型：无中生有。原文没有讨论初始售价。B) 错误类型：因果倒置。设备寿命受电池容量下降影响，不是密封设计直接缩短寿命。D) 错误类型：与原文相悖。原文说密封设计可以提高防水性。故选 C。",
);

apply(
  14,
  [
    "Avoid all portable products with lithium batteries",
    "Replace electronic devices every two years regardless",
    "Choose devices with easily replaceable batteries",
    "Demand free repairs from retailers after purchase",
  ],
  2,
  "原文建议“Choose devices with replaceable batteries whenever possible”，即尽量选择可更换电池的设备，故 C 项正确。A) 错误类型：程度偏移。原文没有要求避开所有锂电池产品。B) 错误类型：无中生有。原文只说电池两三年后容量下降，没有要求每两年换设备。D) 错误类型：无中生有。原文建议使用认证维修服务，没有要求免费维修。故选 C。",
);

apply(
  15,
  [
    "Clear spare parts and labels build consumer trust",
    "They should conceal detailed battery health information",
    "They must abandon all water-resistant designs completely",
    "Lower prices matter more than easy repairability",
  ],
  0,
  "原文说“Clear labels and spare parts build trust”，并主张公开电池健康数据和提供多年电芯，故 A 项正确。B) 错误类型：与原文相悖。原文要求公开电池健康数据。C) 错误类型：与原文相悖。原文认为防水和安全应通过设计协调，而非放弃。D) 错误类型：无中生有。原文没有把低价置于可维修性之上。故选 A。",
);

const report = auditCet6Stage("listening-b", questions);
if (!report.passed) {
  console.error(JSON.stringify(report.errors, null, 2));
  process.exit(1);
}
const temporary = `${outputPath}.tmp`;
fs.writeFileSync(temporary, JSON.stringify(questions, null, 2), "utf8");
fs.renameSync(temporary, outputPath);
console.log(`[manual] listening-b saved: ${questions.length}`);
