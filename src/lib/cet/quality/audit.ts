import type { ExamPaper, Question } from "../../types/exam";
import type { Cet6ContentStage } from "../../types/cet";
import { CET6_STAGE_SPECS } from "../structure";
import {
  ascendingStats,
  chineseCount,
  contentWords,
  correctLetter,
  countArabicFigures,
  declaredAnswerLetter,
  englishWords,
  hasChinese,
  hasThreeSameLetters,
  longestCommonWordRun,
  longWordPercent,
  median,
  overlapRatio,
  paragraphList,
  paragraphStats,
  quoteCount,
  sentenceList,
  specificInfoCount,
  supportSentences,
  supportOverlapRatio,
  wordCount,
} from "./textMetrics";

export type QualitySeverity = "error" | "warning";

export interface QualityCheck {
  id: string;
  label: string;
  severity: QualitySeverity;
  passed: boolean;
  detail?: string;
}

export interface Cet6QualityMetrics {
  listeningTranscriptWords: number[];
  readingBOverlapMedian: number;
  readingCParagraphSigma: number[];
  readingCLongWordPercent: number[];
  translationChineseCharacters: number;
  writingGivenSentenceWords: number;
}

export interface Cet6QualityReport {
  checks: QualityCheck[];
  metrics: Cet6QualityMetrics;
  errors: QualityCheck[];
  warnings: QualityCheck[];
  passed: boolean;
}

const DISTRACTOR_TYPES = [
  "张冠李戴",
  "程度偏移",
  "程度/范围偏移",
  "无中生有",
  "答非所问",
  "因果倒置",
  "与原文相悖",
  "半对半错",
  "偷换范围",
];

function questionsOfKind(paper: ExamPaper, kind: string): Question[] {
  return paper.questions.filter((question) => question.examSection?.kind === kind);
}

export function auditCet6Stage(
  stage: Cet6ContentStage,
  questions: readonly Question[],
): Cet6QualityReport {
  const checks: QualityCheck[] = [];
  const add = (
    id: string,
    label: string,
    passed: boolean,
    detail = "",
    severity: QualitySeverity = "error",
  ) => {
    checks.push({ id, label, severity, passed, detail });
  };
  const spec = CET6_STAGE_SPECS[stage];
  const choices = questions.filter(
    (question): question is Extract<Question, { type: "single-choice" }> =>
      question.type === "single-choice",
  );
  const passages = groupPassages(questions);

  add(
    `${stage}:count`,
    `${spec.labelZh}题目数量`,
    questions.length === expectedCount(stage),
    `实际 ${questions.length}`,
  );
  add(
    `${stage}:kinds`,
    `${spec.labelZh}板块标记`,
    questions.every((question) => question.examSection?.kind === spec.kind),
  );

  if (choices.length > 0) {
    auditChoiceStage(stage, choices, passages, add);
  }
  if (stage === "writing") auditWriting(questions, add);
  if (stage === "reading-a") auditReadingA(questions, passages, add);
  if (stage === "reading-b") auditReadingB(questions, passages, add);
  if (stage === "reading-c") auditReadingC(questions, passages, add);
  if (stage === "translation") auditTranslation(questions, add);

  return reportFromChecks(checks, emptyMetrics());
}

export function auditCet6Paper(paper: ExamPaper): Cet6QualityReport {
  const checks: QualityCheck[] = [];
  const add = (
    id: string,
    label: string,
    passed: boolean,
    detail = "",
    severity: QualitySeverity = "error",
  ) => {
    checks.push({ id, label, severity, passed, detail });
  };

  for (const stage of Object.keys(CET6_STAGE_SPECS) as Cet6ContentStage[]) {
    checks.push(
      ...auditCet6Stage(
        stage,
        questionsOfKind(paper, CET6_STAGE_SPECS[stage].kind),
      ).checks,
    );
  }

  const listening = [
    ...questionsOfKind(paper, "cet-listening-a"),
    ...questionsOfKind(paper, "cet-listening-b"),
    ...questionsOfKind(paper, "cet-listening-c"),
  ];
  const readingC = questionsOfKind(paper, "cet-reading-c");
  const allObjective = paper.questions.filter(
    (question): question is Extract<Question, { type: "single-choice" }> =>
      question.type === "single-choice",
  );
  const listeningLetters = listening.map((question) =>
    question.type === "single-choice"
      ? correctLetter(question.correctAnswer)
      : "",
  );
  const listeningCounts = countLetters(listeningLetters);
  const listeningChoices = listening.filter(
    (question): question is Extract<Question, { type: "single-choice" }> =>
      question.type === "single-choice",
  );
  const listeningPassages = groupPassages(listening);
  const listeningLengths = optionLengthStats(listeningChoices);
  const sharedListeningDistractors = listeningChoices.filter((question) => {
    const correct = contentWords(question.options[question.correctAnswer]);
    return question.options.some((option, index) => {
      if (index === question.correctAnswer) return false;
      return (
        [...contentWords(option)].filter((word) => correct.has(word)).length >=
        2
      );
    });
  }).length;
  const sayAboutCount = listeningChoices.filter((question) =>
    /^What does the (woman|man|speaker) say about/i.test(question.content),
  ).length;
  add(
    "paper:listening-distribution",
    "听力答案覆盖 A-D、最多与最少相差≤1且无连续三题同字母",
    Object.values(listeningCounts).every((count) => count >= 1) &&
      Math.max(...Object.values(listeningCounts)) -
        Math.min(...Object.values(listeningCounts)) <=
        1 &&
      !hasThreeSameLetters(listeningLetters),
    JSON.stringify(listeningCounts),
  );
  add(
    "paper:explanations-chinese",
    "全卷客观题解析使用中文",
    allObjective.every((question) => hasChinese(question.explanation ?? "")),
  );
  add(
    "paper:listening-option-shape",
    "听力四选项均值 6.5-9 词、正确项最长 ≤6/25 且长度差 ≤6",
    listeningLengths.average >= 6.5 &&
      listeningLengths.average <= 9 &&
      listeningLengths.correctLongest <= 6 &&
      listeningLengths.maxSpread <= 6,
    `均值 ${listeningLengths.average.toFixed(1)}；正确项最长 ${listeningLengths.correctLongest}；最大差 ${listeningLengths.maxSpread}`,
  );
  add(
    "paper:listening-distractor-overlap",
    "听力强同形干扰项 ≤4/25",
    sharedListeningDistractors <= 4,
    String(sharedListeningDistractors),
  );
  add(
    "paper:listening-stem-pattern",
    "听力 What does X say about 句式 ≤4/25",
    sayAboutCount <= 4,
    String(sayAboutCount),
  );
  const listeningTranscriptText = listeningPassages
    .map((group) => group.passage)
    .join("\n");
  const listeningStemText = listeningChoices
    .map((question) => question.content)
    .join(" ");
  const listeningStemAverage =
    wordCount(listeningStemText) / Math.max(1, listeningChoices.length);
  add(
    "paper:listening-difficulty",
    "听力脚本长词 15%-18.8%，题干长词≥16%且平均≥10词",
    longWordPercent(listeningTranscriptText) >= 15 &&
      longWordPercent(listeningTranscriptText) <= 18.8 &&
      longWordPercent(listeningStemText) >= 16 &&
      listeningStemAverage >= 10,
    `脚本 ${longWordPercent(listeningTranscriptText).toFixed(1)}%；题干 ${longWordPercent(listeningStemText).toFixed(1)}%，均值 ${listeningStemAverage.toFixed(1)} 词`,
  );
  const listeningTopicOverlaps: Array<{
    left: number;
    right: number;
    overlap: number;
  }> = [];
  for (let left = 0; left < listeningPassages.length; left += 1) {
    for (let right = left + 1; right < listeningPassages.length; right += 1) {
      listeningTopicOverlaps.push({
        left: left + 1,
        right: right + 1,
        overlap: sharedContentCoverage(
          listeningPassages[left]?.passage ?? "",
          listeningPassages[right]?.passage ?? "",
        ),
      });
    }
  }
  const worstTopicOverlap = listeningTopicOverlaps.reduce(
    (worst, pair) => (pair.overlap > worst.overlap ? pair : worst),
    { left: 0, right: 0, overlap: 0 },
  );
  add(
    "paper:listening-topic-overlap",
    "七个听力材料的实词覆盖重合不超过 30%",
    worstTopicOverlap.overlap <= 0.3,
    worstTopicOverlap.left
      ? `材料 ${worstTopicOverlap.left}/${worstTopicOverlap.right}: ${(worstTopicOverlap.overlap * 100).toFixed(1)}%`
      : "材料不足",
  );
  add(
    "paper:answers-declared",
    "全卷客观题解析明确写出正确答案字母",
    allObjective.every((question) => {
      const declared = declaredAnswerLetter(question.explanation ?? "");
      return declared === correctLetter(question.correctAnswer);
    }),
  );
  add(
    "paper:reading-c-answer-distribution",
    "仔细阅读答案每字母 1-4 次",
    (() => {
      const counts = countLetters(
        readingC.map((question) =>
          question.type === "single-choice"
            ? correctLetter(question.correctAnswer)
            : "",
        ),
      );
      return Object.values(counts).every((count) => count >= 1 && count <= 4);
    })(),
  );

  const writingQuestion = questionsOfKind(paper, "cet-writing")[0];
  const writingGiven =
    writingQuestion?.type === "essay"
      ? writingQuestion.content.match(/[“"]([^”"]{20,})[”"]/)?.[1]?.trim() ?? ""
      : "";
  const readingBQuestions = questionsOfKind(paper, "cet-reading-b");
  const readingBParagraphs = splitLabelledParagraphs(
    readingBQuestions[0]?.examSection?.passage ?? "",
  );
  const readingBOverlapValues = readingBQuestions.map((question) =>
    Math.max(
      0,
      ...readingBParagraphs.map((paragraph) =>
        overlapRatio(question.content, paragraph),
      ),
    ),
  );
  const readingCPassages = groupPassages(readingC).map(
    (group) => group.passage,
  );
  const translationQuestion = questionsOfKind(paper, "cet-translation")[0];

  return reportFromChecks(checks, {
    listeningTranscriptWords: listeningPassages.map((group) =>
      wordCount(group.passage),
    ),
    readingBOverlapMedian: median(readingBOverlapValues) * 100,
    readingCParagraphSigma: readingCPassages.map(
      (passage) => paragraphStats(passage).sigma,
    ),
    readingCLongWordPercent: readingCPassages.map(longWordPercent),
    translationChineseCharacters: chineseCount(
      translationQuestion?.content ?? "",
    ),
    writingGivenSentenceWords: wordCount(writingGiven),
  });
}

function sharedContentCoverage(left: string, right: string): number {
  const leftWords = contentWords(left);
  const rightWords = contentWords(right);
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  let shared = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) shared += 1;
  }
  return shared / Math.min(leftWords.size, rightWords.size);
}

function auditChoiceStage(
  stage: Cet6ContentStage,
  choices: readonly Extract<Question, { type: "single-choice" }>[],
  passages: readonly PassageGroup[],
  add: AddCheck,
) {
  const expectedOptions =
    stage === "reading-a" ? 15 : stage === "reading-b" ? 13 : 4;
  add(
    `${stage}:options`,
    stage === "reading-a"
      ? "使用十五项共享选项库"
      : stage === "reading-b"
        ? "使用与正文段落一致的 A-M 选项库"
      : "每题四个选项",
    choices.every((question) => question.options.length === expectedOptions),
  );
  add(
    `${stage}:answers`,
    "答案索引合法",
    choices.every(
      (question) =>
        question.correctAnswer >= 0 &&
        question.correctAnswer < question.options.length,
    ),
  );
  add(
    `${stage}:explanations-chinese`,
    "解析为中文、含英文依据且写明正确字母",
    choices.every((question) => explanationIssues(question).length === 0),
    choices
      .flatMap((question) =>
        explanationIssues(question).map(
          (issue) =>
            `Q${question.examSection?.questionNumber ?? "?"}: ${issue}`,
        ),
      )
      .join("；"),
  );
  if (stage.startsWith("listening") || stage === "reading-c") {
    const weakEvidence = choices.filter((question) => {
      const answerWords = contentWords(
        question.options[question.correctAnswer] ?? "",
      );
      const quotes = [
        ...(question.explanation ?? "").matchAll(/["“]([^"”]{6,})["”]/g),
      ].map((match) => contentWords(match[1] ?? ""));
      return !quotes.some(
        (quote) =>
          [...answerWords].filter((word) => quote.has(word)).length >= 2,
      );
    });
    add(
      `${stage}:answer-evidence`,
      "英文依据与正确选项至少共享两个实词",
      weakEvidence.length === 0,
      weakEvidence
        .map((question) => `Q${question.examSection?.questionNumber ?? "?"}`)
        .join(",") || "0",
    );
  }

  if (stage.startsWith("listening")) {
    const words = passages.map((group) => wordCount(group.passage));
    const letters = choices.map((question) => correctLetter(question.correctAnswer));
    add(
      `${stage}:passages`,
      "听力材料完整且音频按题组组织",
      passages.length === CET6_STAGE_SPECS[stage].groups.length &&
        passages.every((group) => group.passage.trim().length > 0),
      `题组 ${passages.length}`,
    );
    if (stage === "listening-a") {
      add(
        "listening-a:length",
        "听力 A 每篇 360-400 词",
        words.every((count) => count >= 360 && count <= 400),
        words.join("/"),
      );
      add(
        "listening-a:voices",
        "听力 A 每篇长对话均包含 Woman 与 Man 双声",
        passages.every(
          (group) =>
            /\bWoman\s*:/i.test(group.passage) &&
            /\bMan\s*:/i.test(group.passage),
        ),
      );
    }
    if (stage === "listening-b") {
      add(
        "listening-b:length",
        "听力 B 每篇 310-365 词",
        words.every((count) => count >= 310 && count <= 365),
        words.join("/"),
      );
    }
    if (stage === "listening-c") {
      const total = words.reduce((sum, count) => sum + count, 0);
      add(
        "listening-c:length",
        "听力 C 每篇 400-500 词且合计 1300-1450 词",
        words.every((count) => count >= 400 && count <= 500) &&
          total >= 1300 &&
          total <= 1450,
        `${words.join("/")}；合计 ${total}`,
      );
    }
    add(
      `${stage}:answer-pattern`,
      "听力答案覆盖 A-D 且无三连相同",
      Object.values(countLetters(letters)).every((count) => count >= 1) &&
        !hasThreeSameLetters(letters),
      JSON.stringify(countLetters(letters)),
    );
    const optionStats = optionLengthStats(choices);
    add(
      `${stage}:option-length`,
      "套级四选项均值6.5-9词、正确项不系统性最长且长度差≤6词",
      optionStats.average >= 6.5 &&
      optionStats.average <= 9 &&
      optionStats.correctLongest <= Math.floor(choices.length * 0.24) &&
        optionStats.maxSpread <= 6,
      `均值 ${optionStats.average.toFixed(1)}；正确项最长 ${optionStats.correctLongest}；最大差 ${optionStats.maxSpread}`,
    );
    const sharedDistractors = choices.filter((question) => {
      const correct = contentWords(question.options[question.correctAnswer]);
      return question.options.some((option, index) => {
        if (index === question.correctAnswer) return false;
        return [...contentWords(option)].filter((word) => correct.has(word)).length >= 2;
      });
    });
    add(
      `${stage}:distractor-overlap`,
      "与正确项共享两个实词的强同形干扰不超过 16%",
      sharedDistractors.length <= Math.max(1, Math.floor(choices.length * 0.16)),
      `${sharedDistractors.length}/${choices.length}`,
    );
    const sayAbout = choices.filter((question) =>
      /^What does the (woman|man|speaker) say about/i.test(question.content),
    );
    add(
      `${stage}:stem-pattern`,
      "What does X say about 句式不超过 16%",
      sayAbout.length <= Math.max(1, Math.floor(choices.length * 0.16)),
      `${sayAbout.length}/${choices.length}`,
    );
  }
}

function explanationIssues(
  question: Extract<Question, { type: "single-choice" }>,
): string[] {
  const explanation = question.explanation ?? "";
  const issues: string[] = [];
  if (!hasChinese(explanation)) issues.push("缺中文解析");
  if (!/["“][^"”]*[A-Za-z][^"”]*["”]/.test(explanation)) {
    issues.push("缺英文原文引述");
  }
  const expected = correctLetter(question.correctAnswer);
  const declared = declaredAnswerLetter(explanation);
  const proseCorrectLetters = [
    ...explanation.matchAll(/(?:故\s*)?([A-D])\s*项[^。；\n]{0,8}正确/g),
    ...explanation.matchAll(
      /\b(?:option|answer)\s+([A-D])\s+(?:is|was)\s+(?:the\s+)?correct\b/gi,
    ),
  ].map((match) => (match[1] ?? "").toUpperCase());
  const wrongProseClaims = proseCorrectLetters.filter(
    (letter) => letter !== expected,
  );
  if (wrongProseClaims.length > 0) {
    issues.push(
      `正文把 ${[...new Set(wrongProseClaims)].join("/")} 项写成正确项，应为 ${expected} 项`,
    );
  }
  if (!declared) {
    issues.push(`缺“故选 ${expected}”`);
  } else if (declared !== expected) {
    issues.push(`写成“故选 ${declared}”，应为“故选 ${expected}”`);
  }
  return issues;
}

function auditWriting(questions: readonly Question[], add: AddCheck) {
  const writing = questions[0];
  if (writing?.type !== "essay") return;
  const chineseQuoted = [...writing.content.matchAll(/“([^”]{20,})”/g)]
    .map((match) => match[1]?.trim() ?? "")
    .find((sentence) => /[A-Za-z]/.test(sentence));
  const given =
    chineseQuoted ??
    writing.content.match(/[“"]([^”"]{20,})[”"]/)?.[1]?.trim() ??
    "";
  add("writing:given", "写作包含给定开头句", given.length > 0);
  add(
    "writing:given-quotes",
    "给定开头句使用全角中文双引号“…”标注",
    Boolean(chineseQuoted && chineseQuoted === given),
    chineseQuoted ? "" : "未找到全角中文双引号包裹的英文开头句",
  );
  add(
    "writing:prompt-template",
    "作文使用 Project_04 既定 Directions 模板并内嵌给定句",
    /^For this part, you are allowed 30 minutes to write an essay that begins with the sentence “[^”]+” You can make comments, cite examples or use your personal experiences to develop your essay\. You should write at least 150 words but no more than 200 words\.$/i.test(
      writing.content.trim(),
    ),
  );
  if (given) {
    const count = wordCount(given);
    add(
      "writing:given-length",
      "给定开头句 16-25 词",
      count >= 16 && count <= 25,
      String(count),
    );
    add(
      "writing:given-long-words",
      "给定开头句长词比例 26%-66%",
      longWordPercent(given) >= 26 && longWordPercent(given) <= 66,
      `${longWordPercent(given).toFixed(1)}%`,
    );
    add("writing:not-whether", "给定句不使用 whether 争议框架", !/whether/i.test(given));
    add("writing:statement", "给定句为陈述句", !/\?\s*$/.test(given));
    add(
      "writing:no-institution-measure",
      "给定句不得写成“机构＋具体措施”",
      !/\b(?:universities|university|schools|school|colleges|college|governments|government|companies|company)\b[\s\S]*\b(?:should|must|ought to)\b[\s\S]*\b(?:teach|offer|provide|establish|launch|implement|require)\b/i.test(
        given,
      ),
    );
  }
  add(
    "writing:directions",
    "写作指令采用历年真题措辞",
    /use your personal experiences/i.test(writing.content) &&
      /150\s*words/i.test(writing.content) &&
      /200\s*words/i.test(writing.content),
  );
  add(
    "writing:no-whether-framework",
    "写作题目整体不使用 whether 正反问句框架",
    !/whether/i.test(writing.content) &&
      /begins?\s+with\s+the\s+(?:following\s+)?sentence/i.test(
        writing.content,
      ),
  );
  add(
    "writing:criteria-chinese",
    "写作评分标准与说明使用中文",
    hasChinese(writing.scoringCriteria) &&
      (!writing.explanation || hasChinese(writing.explanation)),
  );
  const guidance = writing.writingGuidance?.trim() ?? "";
  add(
    "writing:guidance",
    "写作提供中文思路而非完整英文范文",
    hasChinese(guidance) &&
      guidance.length >= 40 &&
      wordCount(guidance) < 120,
    `中文 ${chineseCount(guidance)} 字，英文词 ${wordCount(guidance)}`,
  );
  const referenceEssay = writing.referenceAnswer?.trim() ?? "";
  const referenceWords = wordCount(referenceEssay);
  const startsWithGiven =
    given.length > 0 &&
    referenceEssay
      .toLowerCase()
      .replace(/\s+/g, " ")
      .startsWith(given.toLowerCase().replace(/\s+/g, " "));
  add(
    "writing:reference-essay",
    "答案稿包含 150-220 词且沿用给定开头句的英文参考范文",
    referenceWords >= 150 && referenceWords <= 220 && startsWithGiven,
    `${referenceWords} 词；开头一致=${startsWithGiven}`,
  );
}

function auditReadingA(
  questions: readonly Question[],
  passages: readonly PassageGroup[],
  add: AddCheck,
) {
  const bank = questions[0]?.examSection?.optionBank ?? [];
  const bankPos = questions[0]?.examSection?.bankPos ?? [];
  const passage = passages[0]?.passage ?? "";
  add("reading-a:bank", "选词词库 15 项", bank.length === 15, String(bank.length));
  add("reading-a:bank-unique", "选词词库不重复", new Set(bank).size === bank.length);
  add(
    "reading-a:bank-pos",
    "选词词库 15 项均标注合法词性",
    bankPos.length === 15 &&
      bankPos.every((part) => ["n", "v", "adj", "adv"].includes(part)),
    `${bankPos.length}; ${[...new Set(bankPos)].join("/")}`,
  );
  add(
    "reading-a:length",
    "选词填空正文 260-300 词",
    wordCount(passage) >= 260 && wordCount(passage) <= 300,
    String(wordCount(passage)),
  );
  const blankNumbers = [
    ...passage.matchAll(/_{2,}\s*(2[6-9]|3[0-5])\s*_{2,}/g),
  ].map((match) => Number(match[1]));
  add(
    "reading-a:blank-order",
    "正文空格按 26-35 的阅读顺序各出现一次",
    blankNumbers.length === 10 &&
      blankNumbers.every((number, index) => number === 26 + index),
    blankNumbers.join(",") || "未识别",
  );
  const bankLong = bank.filter(
    (word) => (englishWords(word)[0]?.length ?? 0) >= 8,
  ).length;
  const bankMean =
    bank.reduce((sum, word) => sum + (englishWords(word)[0]?.length ?? 0), 0) /
    Math.max(1, bank.length);
  add("reading-a:bank-difficulty", "词库长词≥10/15、平均≥8.5字母", bankLong >= 10 && bankMean >= 8.5, `${bankLong}/15, ${bankMean.toFixed(1)}`);
  const letters = questions
    .filter((question): question is Extract<Question, { type: "single-choice" }> =>
      question.type === "single-choice",
    )
    .map((question) => correctLetter(question.correctAnswer));
  const asc = ascendingStats(letters);
  add(
    "reading-a:answer-pattern",
    "选词答案不得三连递增且递增对≤5",
    asc.longestNonDescendingRun <= 2 && asc.ascendingPairs <= 5,
    `${asc.ascendingPairs} 对，最长 ${asc.longestNonDescendingRun}`,
  );
}

function auditReadingB(
  questions: readonly Question[],
  passages: readonly PassageGroup[],
  add: AddCheck,
) {
  const passage = passages[0]?.passage ?? "";
  const bank =
    questions[0]?.examSection?.optionBank ??
    (questions[0]?.type === "single-choice" ? questions[0].options : []) ??
    [];
  const paragraphCount = splitLabelledParagraphs(passage).length;
  add(
    "reading-b:bank",
    "段落匹配选项数与正文段落一致",
    bank.length === paragraphCount &&
      bank.every(
        (letter, index) => letter === String.fromCharCode(65 + index),
      ),
    `选项 ${bank.length}/段落 ${paragraphCount}`,
  );
  for (const check of auditReadingBPassage(passage).checks) {
    add(check.id, check.label, check.passed, check.detail, check.severity);
  }
  const paragraphs = splitLabelledParagraphs(passage);
  const overlaps = questions.map((question) =>
    Math.max(...paragraphs.map((paragraph) => overlapRatio(question.content, paragraph))),
  );
  add(
    "reading-b:rewrite-median",
    "逐条与最相近段落实词重合中位 40%-45%",
    median(overlaps) >= 0.4 && median(overlaps) <= 0.45,
    `${(median(overlaps) * 100).toFixed(0)}%（${questions
      .map(
        (question, index) =>
          `Q${question.examSection?.questionNumber ?? 36 + index}=${(
            overlaps[index] * 100
          ).toFixed(0)}%`,
      )
      .join("，")}）`,
  );
  add(
    "reading-b:rewrite-max",
    "逐条重合上限 ≤69%",
    Math.max(0, ...overlaps) <= 0.69,
    `${(Math.max(0, ...overlaps) * 100).toFixed(0)}%`,
  );
  const statementWordCounts = questions.map((question) =>
    wordCount(question.content),
  );
  add(
    "reading-b:statement-length",
    "陈述句按成熟模板控制在 9-20 词，中位 12-16 词",
    statementWordCounts.every((count) => count >= 9 && count <= 20) &&
      median(statementWordCounts) >= 12 &&
      median(statementWordCounts) <= 16,
    `${statementWordCounts.join("/")}；中位 ${median(statementWordCounts)}`,
  );
  const answerIndices = questions
    .filter((question): question is Extract<Question, { type: "single-choice" }> =>
      question.type === "single-choice",
    )
    .map((question) => question.correctAnswer);
  const used = new Map<number, number>();
  answerIndices.forEach((index) => used.set(index, (used.get(index) ?? 0) + 1));
  add("reading-b:same-paragraph", "同一段落最多对应 2 条陈述", [...used.values()].every((count) => count <= 2));
  add(
    "reading-b:distractors",
    "恰好使用 10 个不同答案段并保留 3 个干扰段",
    used.size === 10 &&
      [...used.values()].every((count) => count === 1),
    `已用 ${used.size} 段`,
  );
  add("reading-b:no-repeat", "连续两题不得对应同一段落", answerIndices.every((value, index) => index === 0 || value !== answerIndices[index - 1]));
  const answerAscending = ascendingStats(answerIndices.map(correctLetter));
  add(
    "reading-b:no-straight",
    "答案段号必须有回头，递增对≤5且不得连续3项递增",
    answerIndices.some(
      (value, index) => index > 0 && value < answerIndices[index - 1],
    ) &&
      answerAscending.ascendingPairs <= 5 &&
      answerAscending.longestNonDescendingRun <= 2,
    `${answerAscending.ascendingPairs} 对，最长 ${answerAscending.longestNonDescendingRun}`,
  );
  add(
    "reading-b:opinion",
    "至少一条观点归属型陈述",
    questions.some((question) =>
      /\b(believes?|argues?|according to|is of the opinion|thinks?)\b/i.test(question.content),
    ),
  );
}

/**
 * Passage-only checks used before the statement set is generated. Keeping this
 * separate lets the generator repair a malformed 13-paragraph passage without
 * also regenerating the statements that depend on it.
 */
export function auditReadingBPassage(passage: string): Cet6QualityReport {
  const checks: QualityCheck[] = [];
  const add = (
    id: string,
    label: string,
    passed: boolean,
    detail = "",
    severity: QualitySeverity = "error",
  ) => {
    checks.push({ id, label, severity, passed, detail });
  };
  const paragraphMatches = [
    ...passage.matchAll(/(?:^|\n)\s*([A-O])(?:[).、]\s*|\s+)/g),
  ].map((match) => match[1]);
  const paragraphCount = new Set(paragraphMatches).size;
  const expectedParagraphs = Array.from(
    { length: paragraphCount },
    (_, index) => String.fromCharCode(65 + index),
  );
  add(
    "reading-b:paragraphs",
    "段落匹配正文 13 个连续标号段落 A-M",
    paragraphCount === 13 &&
      paragraphMatches.length === 13 &&
      paragraphMatches.every(
        (letter, index) => letter === expectedParagraphs[index],
      ),
    `${paragraphCount}; ${paragraphMatches.join("")}`,
  );
  const words = wordCount(passage);
  add(
    "reading-b:length",
    "段落匹配正文 1150-1250 词",
    words >= 1150 && words <= 1250,
    String(words),
  );
  const quotes = quoteCount(passage);
  add(
    "reading-b:quotes",
    "直接引语≥6 且引号总数≥9",
    quotes.direct >= 6 && quotes.total >= 9,
    `${quotes.direct}/${quotes.total}`,
  );
  add(
    "reading-b:quote-attribution",
    "直接引语均有归属",
    directQuotesOwned(passage),
  );
  return reportFromChecks(checks, emptyMetrics());
}

export function auditReadingCPassage(
  passage: string,
  expectedParagraphs: number,
): Cet6QualityReport {
  const checks: QualityCheck[] = [];
  const add = (
    id: string,
    label: string,
    passed: boolean,
    detail = "",
    severity: QualitySeverity = "error",
  ) => {
    checks.push({ id, label, severity, passed, detail });
  };
  const words = wordCount(passage);
  add(
    "reading-c:length",
    "仔细阅读每篇 430-450 词",
    words >= 430 && words <= 450,
    String(words),
  );
  const paragraph = paragraphStats(passage);
  add(
    "reading-c:paragraphs",
    "仔细阅读段落数与指定骨架一致",
    paragraph.count === expectedParagraphs,
    `${paragraph.count}/${expectedParagraphs}`,
  );
  add(
    "reading-c:rhythm",
    "段落长度 σ 26-28.6，含短段与长段",
    paragraph.sigma >= 26 &&
      paragraph.sigma <= 28.6 &&
      paragraph.shortCount >= 2 &&
      paragraph.longCount >= 1,
    `${paragraph.sigma.toFixed(1)}; short=${paragraph.shortCount}; long=${paragraph.longCount}`,
  );
  const sentences = sentenceList(passage).map(wordCount);
  add(
    "reading-c:sentence-variety",
    "最长句 42-87 词，且 ≤12 词短句 4-10 句",
    Math.max(0, ...sentences) >= 42 &&
      Math.max(0, ...sentences) <= 87 &&
      sentences.filter((count) => count <= 12).length >= 4 &&
      sentences.filter((count) => count <= 12).length <= 10,
    `${Math.max(0, ...sentences)}/${sentences.filter((count) => count <= 12).length}`,
  );
  add(
    "reading-c:long-words",
    "≥8 字母词占 20%-27.6%",
    longWordPercent(passage) >= 20 && longWordPercent(passage) <= 27.6,
    `${longWordPercent(passage).toFixed(1)}%`,
  );
  add(
    "reading-c:specifics",
    "具体信息 8-42 处且至少一处阿拉伯数字",
    specificInfoCount(passage) >= 8 &&
      specificInfoCount(passage) <= 42 &&
      countArabicFigures(passage) >= 1,
    `${specificInfoCount(passage)}; figures=${countArabicFigures(passage)}`,
  );
  const quotes = quoteCount(passage);
  add(
    "reading-c:quotes",
    "至少一处引号",
    quotes.total >= 1,
    String(quotes.total),
  );
  add(
    "reading-c:quote-attribution",
    "直接引语均有归属",
    directQuotesOwned(passage),
  );
  add(
    "reading-c:named-source",
    "包含可供观点题使用的具名人物或机构",
    /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/.test(passage),
  );
  return reportFromChecks(checks, emptyMetrics());
}

function auditReadingC(
  questions: readonly Question[],
  passages: readonly PassageGroup[],
  add: AddCheck,
) {
  const choices = questions.filter(
    (question): question is Extract<Question, { type: "single-choice" }> =>
      question.type === "single-choice",
  );
  const optionStats = optionLengthStats(choices);
  add(
    "reading-c:option-average",
    "仔细阅读套级四选项均值 8-10 词",
    optionStats.average >= 8 && optionStats.average <= 10,
    optionStats.average.toFixed(1),
  );
  const longOptionQuestions = choices.filter(
    (question) =>
      question.options.reduce((sum, option) => sum + wordCount(option), 0) /
        4 >=
      9,
  ).length;
  add(
    "reading-c:long-option-mix",
    "四选项均值≥9词的长句型题至少 4/10",
    longOptionQuestions >= 4,
    String(longOptionQuestions),
  );
  add(
    "reading-c:option-length",
    "四选项均≥3词、每题长度差≤6词、正确项最长≤4/10",
    choices.every((question) =>
      question.options.every((option) => wordCount(option) >= 3),
    ) &&
      optionStats.maxSpread <= 6 &&
      optionStats.correctLongest <= 4,
    `正确项最长 ${optionStats.correctLongest}；最大差 ${optionStats.maxSpread}`,
  );
  add(
    "reading-c:distractor-length",
    "每题至少一个干扰项不短于正确项",
    choices.every((question) => {
      const lengths = question.options.map(wordCount);
      const correctLength = lengths[question.correctAnswer];
      return lengths.some(
        (length, index) =>
          index !== question.correctAnswer && length >= correctLength,
      );
    }),
  );
  add(
    "reading-c:stem-length",
    "仔细阅读题干平均≥12词",
    choices.reduce((sum, question) => sum + wordCount(question.content), 0) /
      Math.max(1, choices.length) >=
      12,
    (
      choices.reduce(
        (sum, question) => sum + wordCount(question.content),
        0,
      ) / Math.max(1, choices.length)
    ).toFixed(1),
  );
  add("reading-c:two-passages", "仔细阅读为两篇且每篇 5 题", passages.length === 2 && passages.every((group) => group.questions.length === 5));
  add(
    "reading-c:length",
    "两篇正文各 430-450 词",
    passages.every((group) => wordCount(group.passage) >= 430 && wordCount(group.passage) <= 450),
    passages.map((group) => wordCount(group.passage)).join("/"),
  );
  const stats = passages.map((group) => paragraphStats(group.passage));
  add(
    "reading-c:paragraphs",
    "两篇各 6-12 段且段数不同",
    stats.every((item) => item.count >= 6 && item.count <= 12) &&
      stats[0].count !== stats[1].count,
    stats.map((item) => item.count).join("/"),
  );
  add(
    "reading-c:rhythm",
    "段落长度 σ 26-28.6，含短段与长段",
    stats.every(
      (item) =>
        item.sigma >= 26 &&
        item.sigma <= 28.6 &&
        item.shortCount >= 2 &&
        item.longCount >= 1,
    ),
    stats.map((item) => item.sigma.toFixed(1)).join("/"),
  );
  const sentenceMetrics = passages.map((group) => sentenceList(group.passage));
  add(
    "reading-c:sentence-variety",
    "最长句 42-87 词，且 ≤12 词短句 4-10 句",
    sentenceMetrics.every((sentences) => {
      const lengths = sentences.map(wordCount);
      return (
        Math.max(0, ...lengths) >= 42 &&
        Math.max(0, ...lengths) <= 87 &&
        lengths.filter((count) => count <= 12).length >= 4 &&
        lengths.filter((count) => count <= 12).length <= 10
      );
    }),
    sentenceMetrics
      .map(
        (sentences) =>
          `${Math.max(...sentences.map(wordCount))}/${sentences.filter((sentence) => wordCount(sentence) <= 12).length}`,
      )
      .join(" | "),
  );
  add(
    "reading-c:long-words",
    "两篇 ≥8 字母词占 20%-27.6%",
    passages.every((group) => longWordPercent(group.passage) >= 20 && longWordPercent(group.passage) <= 27.6),
    passages.map((group) => longWordPercent(group.passage).toFixed(1)).join("/"),
  );
  add(
    "reading-c:specifics",
    "两篇具体信息 8-42 处且至少一处阿拉伯数字",
    passages.every((group) => specificInfoCount(group.passage) >= 8 && specificInfoCount(group.passage) <= 42) &&
      passages.every((group) => countArabicFigures(group.passage) >= 1),
  );
  const questionKinds = choices.map((question) => question.examSection?.questionKind ?? "");
  add(
    "reading-c:question-kinds",
    "细节 6-8、推断 1-3、态度 0-1，其他题型 0",
    questionKinds.every((kind) => ["detail", "inference", "attitude"].includes(kind)) &&
      questionKinds.filter((kind) => kind === "detail").length >= 6 &&
      questionKinds.filter((kind) => kind === "detail").length <= 8 &&
      questionKinds.filter((kind) => kind === "inference").length >= 1 &&
      questionKinds.filter((kind) => kind === "inference").length <= 3 &&
      questionKinds.filter((kind) => kind === "attitude").length <= 1,
    JSON.stringify(countBy(questionKinds)),
  );
  const paragraphPositions = passages.map((group) =>
    group.questions.map((question) => question.examSection?.para),
  );
  add(
    "reading-c:read-order",
    "每题标注依据段号且同篇内按阅读顺序排列",
    paragraphPositions.every((positions, passageIndex) => {
      const count = paragraphList(passages[passageIndex]?.passage ?? "").length;
      return (
        positions.every(
          (position) =>
            Number.isInteger(position) &&
            position != null &&
            position >= 1 &&
            position <= count,
        ) &&
        positions.every(
          (position, index) =>
            index === 0 ||
            (position ?? 0) >=
              (positions[index - 1] ?? Number.POSITIVE_INFINITY),
        )
      );
    }),
    paragraphPositions.map((positions) => positions.join("→")).join(" | "),
  );
  const weakAnchors = choices.filter((question) => {
    const group = passages.find((item) => item.questions.includes(question));
    const position = question.examSection?.para;
    if (!group || position == null) return true;
    const paragraphs = paragraphList(group.passage);
    const anchor = paragraphs
      .slice(Math.max(0, position - 2), position)
      .join(" ");
    const anchorWords = contentWords(anchor);
    return (
      question.options.filter(
        (option, index) =>
          index !== question.correctAnswer &&
          [...contentWords(option)].some((word) => anchorWords.has(word)),
      ).length < 2
    );
  });
  add(
    "reading-c:distractor-anchors",
    "依据段及相邻段内有具体锚点的干扰项，每题至少 2 个（例外≤4/10）",
    weakAnchors.length <= 4,
    weakAnchors
      .map((question) => `Q${question.examSection?.questionNumber ?? "?"}`)
      .join(",") || "0",
  );
  const sourceTypes = passages.map((group) => group.questions[0]?.examSection?.source?.type ?? "");
  add(
    "reading-c:sources",
    "两篇均记录原创素材来源类型且类型不同",
    sourceTypes.every(Boolean) && sourceTypes[0] !== sourceTypes[1],
    sourceTypes.join("/"),
  );
  if (passages.length === 2) {
    const misplaced = choices.filter((question) => {
      const own = passages.find((group) => group.questions.includes(question));
      const other = passages.find((group) => group !== own);
      if (!own || !other) return false;
      const text = [
        question.content,
        ...question.options,
      ].join(" ");
      const ownShared = [...contentWords(text)].filter((word) =>
        contentWords(own.passage).has(word),
      ).length;
      const otherShared = [...contentWords(text)].filter((word) =>
        contentWords(other.passage).has(word),
      ).length;
      return otherShared - ownShared >= 3;
    });
    add(
      "reading-c:question-passage",
      "题干与选项属于所在文章（另一篇实词多 3 个即失败）",
      misplaced.length === 0,
      misplaced
        .map((question) => `Q${question.examSection?.questionNumber ?? "?"}`)
        .join(","),
    );
  }
  const support = choices.map((question) => {
    const group = passages.find((item) => item.questions.includes(question));
    return group && question.options[question.correctAnswer]
      ? maxSentenceOverlap(question.options[question.correctAnswer], group.passage)
      : 1;
  });
  add(
    "reading-c:support-overlap",
    "正确项与支撑文段重合率均值 ≤40%",
    support.reduce((sum, value) => sum + value, 0) / Math.max(1, support.length) <= 0.4,
    `${((support.reduce((sum, value) => sum + value, 0) / Math.max(1, support.length)) * 100).toFixed(0)}%`,
  );
  const runs = choices.map((question) => {
    const group = passages.find((item) => item.questions.includes(question));
    return group && question.options[question.correctAnswer]
      ? longestCommonWordRun(question.options[question.correctAnswer], group.passage)
      : 9;
  });
  add(
    "reading-c:verbatim",
    "正确项最长连续原文 ≤3 词，≥3 词的题 ≤2",
    Math.max(0, ...runs) <= 3 && runs.filter((run) => run >= 3).length <= 2,
    runs.join(","),
  );
  const sameSentenceRisks: string[] = [];
  const dualSupportRisks: string[] = [];
  for (const question of choices) {
    const group = passages.find((item) => item.questions.includes(question));
    if (!group) continue;
    const sentenceSets = supportSentences(group.passage).map(contentWords);
    const correct = bestSupport(
      question.options[question.correctAnswer] ?? "",
      sentenceSets,
    );
    const distractors = question.options
      .map((option, index) => ({
        index,
        ...bestSupport(option, sentenceSets),
      }))
      .filter((entry) => entry.index !== question.correctAnswer);
    const number = question.examSection?.questionNumber ?? "?";
    for (const distractor of distractors) {
      if (
        distractor.sentenceIndex === correct.sentenceIndex &&
        distractor.ratio >= 0.6
      ) {
        sameSentenceRisks.push(
          `Q${number}-${correctLetter(distractor.index)}`,
        );
      }
    }
    const strongestDistractor = distractors.reduce(
      (best, entry) => (entry.ratio > best.ratio ? entry : best),
      { index: -1, sentenceIndex: -1, ratio: 0 },
    );
    if (
      strongestDistractor.ratio >= correct.ratio - 0.15 &&
      strongestDistractor.ratio >= 0.5
    ) {
      dualSupportRisks.push(
        `Q${number}-${correctLetter(strongestDistractor.index)}(${(
          strongestDistractor.ratio * 100
        ).toFixed(0)}% vs 键 ${(correct.ratio * 100).toFixed(0)}%)`,
      );
    }
  }
  add(
    "reading-c:same-sentence-warning",
    "同句双解风险（干扰项与正确项共用最强支撑句且重合≥60%）",
    sameSentenceRisks.length === 0,
    sameSentenceRisks.join(",") || "无",
    "warning",
  );
  add(
    "reading-c:dual-support-warning",
    "双支撑人工回读清单（最强干扰项≥正确项-15%且≥50%）",
    dualSupportRisks.length === 0,
    dualSupportRisks.join(",") || "无",
    "warning",
  );
  add(
    "reading-c:distractor-analysis",
    "中文解析逐项排除三个干扰项并写明错因类型",
    choices.every((question) => {
      const explanation = question.explanation ?? "";
      const wrongLetters = ["A", "B", "C", "D"].filter(
        (_, index) => index !== question.correctAnswer,
      );
      return (
        hasChinese(explanation) &&
        wrongLetters.every((letter) =>
          new RegExp(`${letter}\\s*[).、]`).test(explanation),
        ) &&
        DISTRACTOR_TYPES.some((type) => explanation.includes(type))
      );
    }),
  );
  const quotes = quoteCount(passages.map((group) => group.passage).join("\n"));
  add("reading-c:quotes", "两篇合计至少一处引号", quotes.total >= 1);
  add(
    "reading-c:named-opinion",
    "至少一题询问具名人物或机构观点",
    choices.some(
      (question) =>
        /^What does\b/i.test(question.content) &&
        /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(question.content),
    ),
  );
}

function auditTranslation(questions: readonly Question[], add: AddCheck) {
  const translation = questions[0];
  if (translation?.type !== "short-answer") return;
  const chinese = chineseCount(translation.content);
  const clauses = translation.content
    .split(/[。！？；]/)
    .filter((clause) => clause.trim()).length;
  add("translation:length", "翻译原文 170-190 汉字", chinese >= 170 && chinese <= 190, String(chinese));
  add("translation:clauses", "翻译原文 6-8 句", clauses >= 6 && clauses <= 8, String(clauses));
  add(
    "translation:reference",
    "参考译文完整且为英文",
    wordCount(translation.referenceAnswer) >= 100 &&
      !hasChinese(translation.referenceAnswer),
    `${wordCount(translation.referenceAnswer)} 词`,
  );
  add(
    "translation:explanation",
    "翻译说明使用中文",
    !translation.explanation || hasChinese(translation.explanation),
  );
  const glossary = translation.examSection?.glossary ?? [];
  add(
    "translation:glossary",
    "翻译中文词英文提示不超过 3 条且均可行内标注",
    glossary.length <= 3 &&
      glossary.every((entry) => translation.content.includes(entry.zh)) &&
      glossary.every(
        (entry, index) =>
          !glossary.some(
            (other, otherIndex) =>
              index !== otherIndex &&
              entry.zh !== other.zh &&
              entry.zh.includes(other.zh),
          ),
      ),
    String(glossary.length),
  );
}

interface PassageGroup {
  key: string;
  passage: string;
  questions: Question[];
}

function groupPassages(questions: readonly Question[]): PassageGroup[] {
  const groups = new Map<string, PassageGroup>();
  questions.forEach((question) => {
    const key = question.examSection?.groupId ?? "default";
    const existing = groups.get(key);
    if (existing) {
      existing.questions.push(question);
      existing.passage ||= question.examSection?.passage ?? "";
      return;
    }
    groups.set(key, {
      key,
      passage: question.examSection?.passage ?? "",
      questions: [question],
    });
  });
  return [...groups.values()];
}

function splitLabelledParagraphs(passage: string): string[] {
  const matches = [...passage.matchAll(/(?:^|\n)\s*([A-O])(?:[).、]\s*|\s+)/g)];
  return matches.map((match, index) =>
    passage.slice(match.index ?? 0, matches[index + 1]?.index ?? passage.length),
  );
}

function maxSentenceOverlap(answer: string, passage: string): number {
  return supportOverlapRatio(answer, passage);
}

function bestSupport(
  option: string,
  sentenceSets: ReadonlySet<string>[],
): { sentenceIndex: number; ratio: number } {
  const optionWords = contentWords(option.replace(/^[A-D]\)\s*/, ""));
  if (optionWords.size === 0 || sentenceSets.length === 0) {
    return { sentenceIndex: -1, ratio: 0 };
  }
  let sentenceIndex = 0;
  let ratio = -1;
  sentenceSets.forEach((sentence, index) => {
    let shared = 0;
    for (const word of optionWords) {
      if (sentence.has(word)) shared += 1;
    }
    const candidate = shared / optionWords.size;
    if (candidate > ratio) {
      sentenceIndex = index;
      ratio = candidate;
    }
  });
  return { sentenceIndex, ratio: Math.max(0, ratio) };
}

function optionLengthStats(
  questions: readonly Extract<Question, { type: "single-choice" }>[],
) {
  let correctLongest = 0;
  let maxSpread = 0;
  let totalWords = 0;
  let totalOptions = 0;
  questions.forEach((question) => {
    const lengths = question.options.map(wordCount);
    totalWords += lengths.reduce((sum, length) => sum + length, 0);
    totalOptions += lengths.length;
    if (
      lengths[question.correctAnswer] === Math.max(...lengths) &&
      lengths.filter((length) => length === Math.max(...lengths)).length === 1
    ) {
      correctLongest += 1;
    }
    maxSpread = Math.max(maxSpread, Math.max(...lengths) - Math.min(...lengths));
  });
  return {
    correctLongest,
    maxSpread,
    average: totalWords / Math.max(1, totalOptions),
  };
}

function countLetters(letters: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  letters.forEach((letter) => {
    if (letter in counts) counts[letter] += 1;
  });
  return counts;
}

function countBy(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function directQuotesOwned(text: string): boolean {
  const normalized = text.replace(/\\"/g, "\"").replace(/[“”]/g, "\"");
  const matches = [...normalized.matchAll(/"([^"]+)"/g)].filter(
    (match) => wordCount(match[1]) >= 6,
  );
  return matches.every((match) => {
    const start = Math.max(0, (match.index ?? 0) - 100);
    const end = Math.min(
      normalized.length,
      (match.index ?? 0) + match[0].length + 100,
    );
    const window = normalized.slice(start, end);
    return (
      /\b(said|says|argued|argues|notes|wrote|told|claims|according to|points out|observes|warns|admits|explains|suggests|insists|complains|recalled|remarks|remarked|contends|maintains)\b/i.test(
        window,
      ) ||
      /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/.test(window)
    );
  });
}

function expectedCount(stage: Cet6ContentStage): number {
  return CET6_STAGE_SPECS[stage].groups.reduce(
    (sum, group) => sum + Math.max(1, group.questionNumbers.length),
    0,
  );
}

function reportFromChecks(
  checks: QualityCheck[],
  metrics: Cet6QualityMetrics,
): Cet6QualityReport {
  const errors = checks.filter((check) => !check.passed && check.severity === "error");
  const warnings = checks.filter(
    (check) => !check.passed && check.severity === "warning",
  );
  return { checks, metrics, errors, warnings, passed: errors.length === 0 };
}

function emptyMetrics(): Cet6QualityMetrics {
  return {
    listeningTranscriptWords: [],
    readingBOverlapMedian: 0,
    readingCParagraphSigma: [],
    readingCLongWordPercent: [],
    translationChineseCharacters: 0,
    writingGivenSentenceWords: 0,
  };
}

type AddCheck = (
  id: string,
  label: string,
  passed: boolean,
  detail?: string,
  severity?: QualitySeverity,
) => void;
