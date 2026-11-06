import fs from "node:fs";
import path from "node:path";

const dataDir = "E:\\Download\\CET-6";
const paperPath = path.join(
  dataDir,
  "papers",
  "eb32c436-372b-40f6-8f54-ad4a9b6ac830.json",
);
const workingPaperPath = path.join(dataDir, "working-paper.json");
const studentMarkdownPath = path.join(
  dataDir,
  "2026年10月31日六级模拟卷-仅试题.md",
);
const answerMarkdownPath = path.join(
  dataDir,
  "2026年10月31日六级模拟卷-含答案.md",
);

const paper = JSON.parse(fs.readFileSync(paperPath, "utf8"));
const questions = paper.questions;
const byNumber = (number) => {
  const question = questions.find(
    (candidate) => candidate.examSection?.questionNumber === number,
  );
  if (!question) throw new Error(`Missing question ${number}`);
  return question;
};

const replacements = new Map();
const replaceAllIn = (value, before, after) => {
  if (before === after) return value;
  replacements.set(before, after);
  return value.split(before).join(after);
};

const readingA = questions.filter(
  (question) => question.examSection?.kind === "cet-reading-a",
);
const firstReadingA = readingA[0];
const oldReadingAPassage = firstReadingA.examSection.passage;
const newReadingAPassage = [
  "For many students, the first year at university is a difficult transition. Peer tutoring is often introduced as a way to support students who struggle in large introductory courses. Its ____26____ value, however, lies less in extra explanations than in the habits it encourages.",
  "When a tutor asks a student to explain a solved problem aloud, the student must ____27____ hidden gaps in understanding and turn vague confidence into specific questions. This process is most ____28____ when sessions are regular rather than occasional. A weekly meeting gives students time to review notes, test themselves, and ____29____ the material before an exam rather than cramming at the last minute.",
  "The goal is not to make students dependent on tutors. Good tutoring programs also teach students how to ____30____ help at an early stage. Many first-year students wait until they are already behind, partly because they fear appearing unprepared in front of classmates. Tutors can ____31____ this worry by describing asking questions as a normal part of learning rather than a sign of weakness. They may also ____32____ study plans that fit a student's timetable, not an idealized schedule copied from a website.",
  "During sessions, tutors should resist the temptation to supply answers too quickly; instead, they can ask the student to compare two solutions, explain a mistake, or summarize a chapter in a few sentences. Over time, these small routines can ____33____ into durable habits: checking understanding after each lecture, preparing questions in advance, and reviewing errors without shame. Such habits are ____34____ beyond the tutoring room. They help students approach unfamiliar material with patience and ____35____, qualities that matter long after the final examination.",
].join("\n");

for (const question of readingA) {
  if (question.examSection?.passage) {
    question.examSection.passage = newReadingAPassage;
  }
  question.options = question.options.map((option) =>
    option === "acknowledge" ? "enrolment" : option,
  );
  if (Array.isArray(question.examSection?.bankPos)) {
    question.examSection.bankPos[1] = "n";
  }
}
replaceAllIn("", "B. acknowledge", "B. enrolment");
replaceAllIn("", oldReadingAPassage, newReadingAPassage);

const readingAExplanations = {
  26:
    "空格修饰 value，并与学习语境呼应：学术价值不只在于额外讲解，更在于培养习惯。最接近的干扰项中，considerable 表示“相当多的”，measurable 表示“可测量的”，transferable 表示“可迁移的”，都不能准确表达 academic value。故选 I。",
  27:
    "此处需要动词，digest 等词都不能与 hidden gaps 构成自然搭配；identify 表示“识别、找出”，identify hidden gaps in understanding 即发现隐藏的理解缺口。最接近的干扰项中，enrolment 是名词，不能填入需要动词的空格；coordinate 意为“协调”，也不能与 gaps 构成自然搭配。故选 M。",
  28:
    "空格作表语，说明规律辅导最有成效。effective 表示“有效的”，符合 “most effective when sessions are regular” 的搭配。measurable 表示“可测量的”，considerable 表示“相当大的”，transferable 表示“可迁移的”，均不贴合语境。故选 J。",
  29:
    "此处需要动词，表示在考试前消化、吸收材料。digest 表示“理解并吸收”，与 material 搭配自然。seek 表示“寻求”，develop 表示“产生”，coordinate 表示“协调”，都不能准确表达复习材料这一语境。故选 F。",
  30:
    "seek help 是固定搭配，表示“寻求帮助”；句意是教学生如何在早期主动求助。最接近的干扰项中，enrolment 是名词，不能与 help 构成自然搭配；identify 表示“识别”，与 help 搭配不如 seek 自然。故选 E。",
  31:
    "worry 可以与 reduce 搭配，表示“减轻担忧”；后半句的 by describing asking questions as a normal part 正是减轻担忧的方式。compensate 不能自然接 worry，develop 则表示“产生担忧”，与语境相反；enrolment 是名词，也不能填入动词空。故选 C。",
  32:
    "design study plans 表示“设计学习计划”，与 fit a student's timetable 自然衔接。coordinate 更强调协调多个对象，digest 强调理解吸收，compensate 强调补偿，都不能准确搭配 study plans。故选 N。",
  33:
    "develop into 表示“逐渐发展为”，small routines 后续变成 durable habits，语义连贯。seek into、identify into、coordinate into 都不能表达这一自然的发展过程。故选 D。",
  34:
    "transferable 表示“可迁移的”，用来描述这些习惯可以超越辅导室、应用到陌生材料中。academic 与句意部分相关，但不能体现 beyond the tutoring room；measurable 和 effective 也不如 transferable 准确。故选 O。",
  35:
    "resilience 表示“韧性”，与 patience 并列，描述学生面对陌生材料时应具备的品质。enrolment 是名词但语义不符，“with patience and enrolment”不能成立；academic 和 effective 虽可作形容词，却不能放在名词位置。故选 H。",
};

for (const question of readingA) {
  const number = question.examSection.questionNumber;
  const letter = "ABCDEFGHIJKLMNO"[question.correctAnswer];
  const explanation = `${letter}) ${readingAExplanations[number]}`;
  replaceAllIn("", question.explanation, explanation);
  question.explanation = explanation;
}

const readingBQuestions = questions.filter(
  (question) => question.examSection?.kind === "cet-reading-b",
);
if (readingBQuestions.length !== 10) {
  throw new Error(`Expected 10 Reading B questions, got ${readingBQuestions.length}`);
}

const q43 = byNumber(43);
const oldQ43Content = q43.content;
const newQ43Content =
  "A half-year trial initially keeps the campus connection intact and commits to weekly public reporting.";
replaceAllIn("", oldQ43Content, newQ43Content);
q43.content = newQ43Content;
const oldQ43Explanation = q43.explanation;
q43.explanation =
  "M段写市议会拟表决六个月试点，前八周保留校园环线，并由交通当局每周公布客流、换乘与事故数据。H段只是更早的两晚分阶段测试建议，L段讨论夜间公交的根本目的，均不如M段完整。故选 M。";
replaceAllIn("", oldQ43Explanation, q43.explanation);

const q44 = byNumber(44);
const oldQ44Content = q44.content;
const newQ44Content =
  "Students gathered petition signatures to protect a direct campus link, though they conceded occasional lateness.";
replaceAllIn("", oldQ44Content, newQ44Content);
q44.content = newQ44Content;
const oldQ44Explanation = q44.explanation;
q44.explanation =
  "D段写学生会收集4,000多个签名，要求保留直达校园环线，同时承认旧线路有时不准点。C段聚焦学生反对与夜间换乘风险，E段转向夜班护士的立场，均不如D段同时包含请愿规模与让步。故选 D。";
replaceAllIn("", oldQ44Explanation, q44.explanation);

const q46OptionCleanup = byNumber(46);
q46OptionCleanup.options[0] =
  "Loan counts already clearly showed all quiet reading-room use today.";

const q50 = byNumber(50);
q50.examSection.para = 6;

const q46 = byNumber(46);
const oldLibraryPassage = q46.examSection.passage;
let newLibraryPassage = oldLibraryPassage;
for (const [before, after] of [
  ["That old metric remains narrow.", "That measure captures only a fraction of the library’s wider contribution."],
  ["The Riverton Public Library", "The Caldwell Public Library"],
  ["Riverton’s monthly dwell-time reports", "Caldwell’s monthly dwell-time reports"],
  ["Riverton’s 2025 budget hearing", "Caldwell’s 2025 budget hearing"],
  ["Dr. Miriam Calder, a public policy researcher at Northfield University", "Dr. Miriam Calder, a public policy researcher at Claremont University"],
  ["or merely incidental quiet shelter.", "or merely incidental quiet shelter."],
  ["That quieter evidence remains locally persuasive to many library staff.", "For many library staff, this quieter evidence is more persuasive than circulation totals."],
  ["according to staff interviews and daily observation logs collected during the winter pilot", "according to staff interviews and winter observation logs"],
  ["nearly $1.8 million in logged staff assistance", "48,000 recorded staff-assistance interactions"],
  ["That unresolved metric debate remains politically unsettled even today locally.", "The dispute over how success should be measured therefore remains unresolved."],
  ["in formal talks without expert help", "in formal proceedings without expert help"],
]) {
  newLibraryPassage = newLibraryPassage.split(before).join(after);
}
for (const question of questions.filter(
  (candidate) => candidate.examSection?.groupId === "cet6-reading-c-passage-1",
)) {
  if (question.examSection?.passage) {
    question.examSection.passage = newLibraryPassage;
  }
  question.content = question.content
    .split("Riverton Public Library")
    .join("Caldwell Public Library")
    .split("Riverton pilot")
    .join("Caldwell pilot")
    .split("Riverton’s")
    .join("Caldwell’s");
  if (question.explanation) {
    question.explanation = question.explanation
      .split("Riverton Public Library")
      .join("Caldwell Public Library")
      .split("Riverton pilot")
      .join("Caldwell pilot")
      .split("Riverton’s")
      .join("Caldwell’s");
  }
}
replaceAllIn("", oldLibraryPassage, newLibraryPassage);

const q51 = byNumber(51);
const oldNoisePassage = q51.examSection.passage;
let newNoisePassage = oldNoisePassage;
for (const [before, after] of [
  ["Dr. Helena Marsh", "Dr. Helena Sayers"],
  ["formal talks", "formal proceedings"],
]) {
  newNoisePassage = newNoisePassage.split(before).join(after);
}
for (const question of questions.filter(
  (candidate) => candidate.examSection?.groupId === "cet6-reading-c-passage-2",
)) {
  if (question.examSection?.passage) {
    question.examSection.passage = newNoisePassage;
  }
  for (const [before, after] of [
    ["Dr. Helena Marsh", "Dr. Helena Sayers"],
    ["formal talks", "formal proceedings"],
  ]) {
    question.content = question.content.split(before).join(after);
    if (question.explanation) {
      question.explanation = question.explanation.split(before).join(after);
    }
  }
}
replaceAllIn("", oldNoisePassage, newNoisePassage);

byNumber(46).examSection.source.outlet = "原创（无外部素材）";
byNumber(51).examSection.source.outlet = "原创（无外部素材）";

const readingBPassageQuestion = byNumber(36);
const oldReadingBPassage = readingBPassageQuestion.examSection.passage;
for (const [before, after] of [
  ["Riverton Transit Authority", "Riverton Transit Authority"],
  ["Maya Chen, the authority's planning director", "Raleigh Chen, the authority's planning director"],
  ["Dr. Elena Ward", "Dr. Leah Ward"],
]) {
  readingBPassageQuestion.examSection.passage =
    readingBPassageQuestion.examSection.passage.split(before).join(after);
}
replaceAllIn(
  "",
  oldReadingBPassage,
  readingBPassageQuestion.examSection.passage,
);

const listeningBPassageQuestion = byNumber(12);
const oldListeningBPassage = listeningBPassageQuestion.examSection.passage;
const newListeningBPassage = [
  "Battery repairability has become a public issue because batteries age faster than many other parts. A phone or laptop may work well, yet its battery loses capacity after two or three years. If the battery is sealed inside with glue, replacing it becomes unnecessarily difficult, and many devices are discarded while their screens and processors are still useful.",
  "That design choice creates a second problem: the battery often fails before the rest of the device, so disposing of the whole product wastes working screens, cameras, and processors.",
  "Sealed designs can improve water resistance and safety, but they also involve real trade-offs. Lithium batteries are dangerous if punctured or overheated, and an untrained replacement can cause a fire. Repairs require training and careful handling, not simply a video and a screwdriver. Certified technicians use insulated tools, check battery health, and follow disposal rules. This is why some neighborhood repair cafes now refuse battery swaps and direct residents to certified services.",
  "Ordinary consumers should choose devices with replaceable batteries whenever possible. They should ask retailers whether spare parts and manuals are available, use certified repair services, and never put damaged batteries in ordinary rubbish.",
  "Clear labels and available spare parts build trust. Manufacturers should design screws rather than glue, publish battery health data, and supply cells for several years. Retailers should train staff to explain repairability and safety.",
  "Consumer expectations are changing. People once accepted sealed devices without question; now they ask how long a battery will last and whether it can be replaced. Neighborhood repair habits are returning, but safety rules must guide them. Good design should make repair safer, not simply harder. Convenience and safety are not opposites: a device can be both secure and serviceable if engineers plan for maintenance from the start. The worst outcome is a device that cannot be opened and cannot be safely used after a few years.",
].join("\n\n");
listeningBPassageQuestion.examSection.passage = newListeningBPassage;
for (const question of questions.filter(
  (candidate) => candidate.examSection?.groupId === listeningBPassageQuestion.examSection.groupId,
)) {
  if (question.explanation) {
    question.explanation = question.explanation
      .split("Dr. Elena Marsh")
      .join("Dr. Elena Farrow")
      .split("Host:")
      .join("")
      .split("Guest:")
      .join("");
  }
}
replaceAllIn("", oldListeningBPassage, newListeningBPassage);

const listeningCHeat = byNumber(16);
const oldListeningCHeatPassage = listeningCHeat.examSection.passage;
listeningCHeat.examSection.passage = listeningCHeat.examSection.passage
  .split("The Riverton heat pilot")
  .join("The Kingsport heat pilot")
  .split("Dr. Maya Chen")
  .join("Dr. Maya Quinlan")
  .concat(
    " A public maintenance calendar will also show future cleaning and watering dates.",
  );
replaceAllIn(
  "",
  oldListeningCHeatPassage,
  listeningCHeat.examSection.passage,
);
for (const question of questions.filter(
  (candidate) => candidate.examSection?.groupId === listeningCHeat.examSection.groupId,
)) {
  question.content = question.content
    .split("Riverton heat pilot")
    .join("Kingsport heat pilot");
  if (question.explanation) {
    question.explanation = question.explanation
      .split("Riverton heat pilot")
      .join("Kingsport heat pilot")
      .split("Dr. Maya Chen")
      .join("Dr. Maya Quinlan");
  }
}

for (const [number, addition] of [
  [
    19,
    " The station also interviews the technicians who worked on each collection, because future staff will need to understand old repairs, missing sections, and decisions made during the original transfer. These interviews are stored with the audio so technical knowledge is not lost when experienced staff retire. Each collection will also include a short listening guide so schools and community groups can understand the recordings without specialist equipment.",
  ],
  [
    22,
    " Staff will also label the project's limits clearly, because an accessible design should explain what is being improved, what remains difficult, and when the next review will take place. That honesty helps visitors decide whether to plan a visit now or wait for a later phase of construction. The reference group will publish a brief annual report describing changes that worked and changes that still require further testing.",
  ],
]) {
  const first = byNumber(number);
  const oldPassage = first.examSection.passage;
  const newPassage = oldPassage.concat(addition);
  for (const question of questions.filter(
    (candidate) => candidate.examSection?.groupId === first.examSection.groupId,
  )) {
    if (question.examSection?.passage) {
      question.examSection.passage = newPassage;
    }
  }
  replaceAllIn("", oldPassage, newPassage);
}

const translation = questions.find(
  (question) => question.examSection?.kind === "cet-translation",
);
if (!translation) throw new Error("Missing translation question");
const oldTranslation =
  "如今，这些茶品不仅进入城市茶馆，也成为节庆市集上的新宠。";
const newTranslation =
  "老茶师也参与试品和改进记录。如今，这些茶品不仅进入城市茶馆，也成为节庆市集上的新宠。";
translation.content = translation.content
  .split(oldTranslation)
  .join(newTranslation);
const oldReferenceTail =
  "Today, these teas have not only entered urban teahouses but also become favorites at festive markets.";
const newReferenceTail =
  "Veteran tea masters also join tasting sessions and help document each improvement. Today, these teas have not only entered urban teahouses but also become favorites at festive markets.";
translation.referenceAnswer = translation.referenceAnswer
  .split(oldReferenceTail)
  .join(newReferenceTail);
const oldLastTranslationPoint =
  "“城市茶馆”“节庆市集上的新宠”表达自然，如 urban teahouses, favorites at festive markets。";
const newLastTranslationPoint =
  "“老茶师也参与试品和改进记录”信息完整，如 veteran tea masters also join tasting sessions and help document each improvement。";
translation.scoringPoints.push(newLastTranslationPoint);
replaceAllIn("", oldTranslation, newTranslation);
replaceAllIn("", oldReferenceTail, newReferenceTail);
replaceAllIn(
  "",
  `> - ${oldLastTranslationPoint}`,
  `> - ${oldLastTranslationPoint}\n> - ${newLastTranslationPoint}`,
);

for (const question of questions) {
  if (question.explanation) {
    question.explanation = question.explanation
      .split("Riverton heat pilot")
      .join("Kingsport heat pilot")
      .split("Dr. Maya Chen")
      .join("Dr. Maya Quinlan")
      .split("Dr. Helena Marsh")
      .join("Dr. Helena Sayers");
  }
  if (question.content) {
    question.content = question.content
      .split("Riverton heat pilot")
      .join("Kingsport heat pilot")
      .split("Dr. Helena Marsh")
      .join("Dr. Helena Sayers");
  }
  if (question.options) {
    question.options = question.options.map((option) =>
      option
        .split("Riverton heat pilot")
        .join("Kingsport heat pilot")
        .split("Dr. Helena Marsh")
        .join("Dr. Helena Sayers"),
    );
  }
}

const writing = questions.find(
  (question) => question.examSection?.kind === "cet-writing",
);
if (!writing) throw new Error("Missing writing question");
if (writing.referenceAnswer.startsWith("Faced with growing public distrust")) {
  const oldWritingSentence =
    "universities and communities must treat civic learning as a shared obligation, not a compliance exercise.";
  const newWritingSentence =
    "civic learning matters most when universities and communities build it together rather than assign compliance tasks.";
  const oldWritingGuidance = writing.writingGuidance;
  const oldWritingScoring = writing.scoringCriteria;
  const oldWritingExplanation = writing.explanation;
  writing.referenceAnswer = writing.referenceAnswer.replace(
    oldWritingSentence,
    newWritingSentence,
  );
  writing.content = writing.content.replace(
    oldWritingSentence,
    newWritingSentence,
  );
  writing.writingGuidance = writing.writingGuidance
    .split("共同义务”与“合规任务”的区别")
    .join("共同建设”与“合规任务”的区别");
  writing.scoringCriteria = writing.scoringCriteria
    .split("共同义务而非合规任务")
    .join("共同建设而非合规任务");
  writing.explanation = writing.explanation
    .split("大学与社区共同承担的义务")
    .join("大学与社区共同建设的成果");
  replaceAllIn("", oldWritingSentence, newWritingSentence);
  replaceAllIn("", oldWritingGuidance, writing.writingGuidance);
  replaceAllIn("", oldWritingScoring, writing.scoringCriteria);
  replaceAllIn("", oldWritingExplanation, writing.explanation);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
for (const file of [paperPath, workingPaperPath, studentMarkdownPath, answerMarkdownPath]) {
  fs.copyFileSync(file, `${file}.review-fix-${timestamp}.bak`);
}

const serialized = `${JSON.stringify(paper, null, 2)}\n`;
fs.writeFileSync(paperPath, serialized, "utf8");
fs.writeFileSync(workingPaperPath, serialized, "utf8");

for (const markdownPath of [studentMarkdownPath, answerMarkdownPath]) {
  let markdown = fs.readFileSync(markdownPath, "utf8");
  for (const [before, after] of replacements) {
    markdown = markdown.split(before).join(after);
  }
  markdown = markdown
    .split("Riverton Public Library")
    .join("Caldwell Public Library")
    .split("2023 Riverton pilot")
    .join("2023 Caldwell pilot")
    .split("Riverton heat pilot")
    .join("Kingsport heat pilot")
    .split("Dr. Helena Marsh")
    .join("Dr. Helena Sayers")
    .split("Dr. Elena Marsh")
    .join("Dr. Elena Farrow")
    .split("Host:")
    .join("")
    .split("Guest:")
    .join("");
  if (markdownPath === answerMarkdownPath) {
    const explanationByNumber = new Map(
      readingA.map((question) => [
        String(question.examSection.questionNumber),
        question.explanation,
      ]),
    );
    markdown = markdown
      .split(/\n\n(?=\d+\.\s)/)
      .map((block) => {
        const number = block.match(/^(\d+)\.\s/)?.[1];
        const explanation = number
          ? explanationByNumber.get(number)
          : undefined;
        if (!explanation) return block;
        return block.replace(
          /(> \*\*【解析】\*\*\n> )[^\n]*/,
          `$1${explanation}`,
        );
      })
      .join("\n\n");
  }
  fs.writeFileSync(markdownPath, markdown, "utf8");
}

console.log(
  JSON.stringify(
    {
      paperPath,
      workingPaperPath,
      studentMarkdownPath,
      answerMarkdownPath,
      readingAQuestions: readingA.length,
      readingBQuestions: readingBQuestions.length,
      replacementCount: replacements.size,
    },
    null,
    2,
  ),
);
