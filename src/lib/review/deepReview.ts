import { z } from "zod";
import { extractJson } from "../api/extractJson";
import type { ExamPaper, Question } from "../types/exam";
import type { ReviewAnalysis } from "./analysis";

export interface PreviousReviewSummary {
  createdAt: string;
  objectiveScore: number;
  writingScore?: number;
  translationScore?: number;
  totalScore?: number;
  errorTypes: string[];
}

export interface DeepReviewInput {
  paper: ExamPaper;
  analysis: ReviewAnalysis;
  reviewCreatedAt: string;
  reviewNotes: string;
  readingArticleCard: string;
  previousReviews: PreviousReviewSummary[];
}

export interface DeepReviewResult {
  markdown: string;
  writingScore?: number;
  translationScore?: number;
  errorTypes: string[];
}

const DeepReviewEnvelopeSchema = z.object({
  markdown: z.string().min(100),
  writingScore: z.number().min(1).max(15).nullable().optional(),
  translationScore: z.number().min(1).max(15).nullable().optional(),
  errorTypes: z.array(z.string().min(1)).max(20).default([]),
});

function assertDeepReviewStructure(markdown: string): void {
  const missing = Array.from({ length: 9 }, (_, index) => index).filter(
    (index) =>
      !new RegExp(`(?:^|\\n)#{1,6}\\s*${index}(?:[.、:：\\s]|$)`).test(
        markdown,
      ),
  );
  const scheduleMissing = ["D+1", "D+3", "D+7", "D+16", "D+35"].filter(
    (label) => !markdown.includes(label),
  );
  if (missing.length || scheduleMissing.length) {
    throw new Error(
      [
        missing.length ? `缺少复盘栏目：${missing.join("、")}` : "",
        scheduleMissing.length
          ? `缺少间隔复扫日期：${scheduleMissing.join("、")}`
          : "",
      ]
        .filter(Boolean)
        .join("；"),
    );
  }
}

const WRITING_RUBRIC = `写作官方总体印象分五档：
- 14 分档（13-15）：切题；表达思想清楚，文字通顺、连贯，基本上无语言错误，仅有个别小错。
- 11 分档（10-12）：切题；表达思想清楚，文字连贯，但有少量语言错误。
- 8 分档（7-9）：基本切题；有些地方表达思想不够清楚，文字勉强连贯，语言错误相当多，其中有一些是严重错误。
- 5 分档（4-6）：基本切题；表达思想不清楚，连贯性差，有较多的严重语言错误。
- 2 分档（1-3）：条理不清，思路紊乱，语言支离破碎或大部分句子均有错误，且多数为严重错误。`;

const TRANSLATION_RUBRIC = `翻译官方总体印象分五档：
- 14 分档（13-15）：译文准确表达了原文的意思；译文流畅，结构清晰，用词贴切，基本无语言错误，仅有个别小错。
- 11 分档（10-12）：译文基本表达了原文的意思；结构较清晰，语言通顺，但有少量语言错误。
- 8 分档（7-9）：译文勉强表达了原文的意思；译文勉强连贯，语言错误相当多，其中有一些是严重错误。
- 5 分档（4-6）：译文仅表达了小部分原文的意思；译文连贯性差，有相当多的严重语言错误。
- 2 分档（1-3）：除个别词语或句子，译文基本没有表达原文的意思。`;

const ERROR_TYPES = `旧流程错误类型只能从以下名称中选择；确实装不进去时才新增一个，并给出定义：
无据、张冠李戴、背景常识、与原文相反、绝对化、多选项都出现、原词陷阱、
近似表达、漏听、被否定项、词性错、两空对调、同类副词意图/频率错位。`;

function questionPassage(paper: ExamPaper, question: Question): string {
  const groupQuestions = paper.questions.filter(
    (candidate) =>
      candidate.examSection?.kind === question.examSection?.kind &&
      candidate.examSection?.groupId === question.examSection?.groupId,
  );
  const passage =
    groupQuestions.find((candidate) => candidate.examSection?.passage)
      ?.examSection?.passage ?? "";
  const paragraphNumber = question.examSection?.para;
  if (passage && paragraphNumber) {
    const paragraphs = passage.split(/\n+/).filter(Boolean);
    return paragraphs[paragraphNumber - 1] ?? passage;
  }
  return passage;
}

function wrongQuestionContext(
  paper: ExamPaper,
  analysis: ReviewAnalysis,
): string {
  if (analysis.wrong.length === 0) return "本次没有标记客观题错项。";
  return analysis.wrong
    .map((result) => {
      const question = paper.questions.find((item) => item.id === result.id);
      if (question?.type !== "single-choice") return "";
      const selectedIndex =
        result.selected == null ? -1 : result.selected.charCodeAt(0) - 65;
      const selectedOption = question.options[selectedIndex] ?? "未选择";
      const correctOption =
        question.options[question.correctAnswer] ?? result.correct;
      const passage = questionPassage(paper, question);
      return [
        `### Q${result.questionNumber} · ${result.kind}`,
        `题干：${question.content}`,
        `学生选择：${result.selected} — ${selectedOption}`,
        `标准答案：${result.correct} — ${correctOption}`,
        `题目解析：${question.explanation ?? ""}`,
        passage ? `对应原文：\n${passage}` : "对应原文：本题没有保留共享原文。",
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function writingContext(analysis: ReviewAnalysis): string {
  if (analysis.writingTask?.type !== "essay") return "本卷没有写作题。";
  if (!analysis.writingAnswer.trim()) return "学生尚未提交写作作答。";
  return [
    `写作题目：${analysis.writingTask.content}`,
    `学生作答（${analysis.writingWordCount} 词）：`,
    analysis.writingAnswer,
  ].join("\n\n");
}

function translationContext(analysis: ReviewAnalysis): string {
  if (analysis.translationTask?.type !== "short-answer") {
    return "本卷没有翻译题。";
  }
  if (!analysis.translationAnswer.trim()) return "学生尚未提交翻译作答。";
  return [
    `翻译原文：${analysis.translationTask.content}`,
    `参考译文：${analysis.translationTask.referenceAnswer}`,
    `学生作答（${analysis.translationChineseCharacters} 个汉字）：`,
    analysis.translationAnswer,
  ].join("\n\n");
}

function previousContext(previousReviews: PreviousReviewSummary[]): string {
  if (previousReviews.length === 0) return "没有可用的历史复盘记录。";
  return previousReviews
    .slice(0, 8)
    .map((review) =>
      [
        review.createdAt,
        `客观题 ${review.objectiveScore.toFixed(1)}`,
        review.writingScore == null ? "写作未评分" : `写作 ${review.writingScore}/15`,
        review.translationScore == null
          ? "翻译未评分"
          : `翻译 ${review.translationScore}/15`,
        review.totalScore == null
          ? "总分未完成"
          : `总分 ${review.totalScore.toFixed(1)}/710`,
        `已记录错型：${review.errorTypes.length ? review.errorTypes.join("、") : "无"}`,
      ].join("｜"),
    )
    .join("\n");
}

export function reviewSchedule(createdAt: string): Array<{
  label: string;
  date: string;
}> {
  const base = new Date(createdAt);
  const validBase = Number.isNaN(base.getTime()) ? new Date() : base;
  return [1, 3, 7, 16, 35].map((days) => {
    const next = new Date(validBase);
    next.setDate(next.getDate() + days);
    return {
      label: `D+${days}`,
      date: [
        next.getFullYear(),
        String(next.getMonth() + 1).padStart(2, "0"),
        String(next.getDate()).padStart(2, "0"),
      ].join("-"),
    };
  });
}

export function buildDeepReviewMessages(input: DeepReviewInput): Array<{
  role: "system" | "user";
  content: string;
}> {
  const { analysis } = input;
  const schedule = reviewSchedule(input.reviewCreatedAt);
  return [
    {
      role: "system",
      content: [
        "你是执行 Project_04 六级旧版批改闭环的阅卷教师。",
        "必须严格按四层复盘：事实、归因、模式、动作；不能只报分数或只贴解析。",
        "归因必须把学生所选选项与标准答案分别拿回原文核对，并命名成可复用错型。",
        ERROR_TYPES,
        "没有学生听感或犹豫信息时，只能写成“根据选项—原文对照推断”，不得假装知道学生当时怎么听。",
        "动作必须是否定句改成的肯定动作，并带次数、时间或数量阈值。",
        "写作和翻译只能按官方总体印象法先定档、再定档内分，逐句分类只作诊断，不参与计分。",
        "升级范文必须以学生原文为底稿改写，不能另写无关模板；升级版也必须单独打分并说明离下一档差什么。",
        "阅读 C 文章层坚持“先自己拆，再用 AI 对”：学生空白时不得代写生词和结构，只给出待完成清单。",
        "不得编造题目、答案、原文或用户经历。只输出简体中文报告。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `试卷：${input.paper.title}`,
        `复盘时间：${input.reviewCreatedAt}`,
        `客观题：${analysis.correct}/${analysis.answered}，得分 ${analysis.objectiveScore.toFixed(1)}/${analysis.objectiveMaxScore.toFixed(1)}。`,
        `客观题默认未标记者答对；本次标记错题 ${analysis.wrong.length} 道。`,
        "",
        "## 事实数据",
        `已标记错题：${analysis.wrong.map((item) => item.questionNumber).join("、") || "无"}`,
        "答案冲突：应用已按标准答案计分；用户如只提供了错误题号，不得擅自改写学生选择。",
        "",
        "## 错题证据",
        wrongQuestionContext(input.paper, analysis),
        "",
        "## 学生复盘补充",
        input.reviewNotes.trim() || "未提供听感、犹豫或蒙对题信息。",
        "",
        "## 阅读 C 文章层（学生先做）",
        input.readingArticleCard.trim() ||
          "学生尚未提交文章层。不要代写，只说明需要完成生词、主干/修饰、段落角色和主旨。",
        "",
        "## 历史模式",
        previousContext(input.previousReviews),
        "",
        "## 写作",
        WRITING_RUBRIC,
        writingContext(analysis),
        "",
        "## 翻译",
        TRANSLATION_RUBRIC,
        translationContext(analysis),
        "",
        "## 复扫日期",
        schedule.map((item) => `${item.label}: ${item.date}`).join("；"),
        "",
        "## 输出要求",
        "返回严格 JSON，外层只含以下字段：",
        '{"markdown":"完整 Markdown 报告","writingScore":8,"translationScore":7,"errorTypes":["无据","与原文相反"]}',
        "writingScore/translationScore 仅在学生实际提交该部分时给 1-15 的整数，否则填 null。",
        "markdown 必须依次包含：",
        "0 成绩总览；1 事实；2 归因表（每题含学生选项原文出处、答案依据、错型）；",
        "3 模式（连续几套、上次处方是否奏效、单套观察是否复核）；",
        "4 动作（每条含阈值）；5 阅读 C 文章层核对；",
        "6 写作批改（15 分制定档、得分依据、S1-S5 逐句诊断、必改三句、基于学生原文的升级范文及升级版分数、离下一档差什么）；",
        "7 翻译批改（T1-T6 逐句诊断、必改三句、升级译文及分数、离下一档差什么）；",
        "8 间隔复扫日历与今天按优先级可执行的 10-15 分钟任务。",
      ].join("\n"),
    },
  ];
}

export function parseDeepReviewReply(reply: string): DeepReviewResult {
  const fallback = reply.trim();
  const { json } = extractJson(reply);
  if (!json) {
    if (fallback.length < 100) {
      throw new Error("模型没有返回完整的复盘报告。");
    }
    assertDeepReviewStructure(fallback);
    return { markdown: fallback, errorTypes: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    if (fallback.length >= 100) {
      assertDeepReviewStructure(fallback);
      return { markdown: fallback, errorTypes: [] };
    }
    throw new Error("模型返回的复盘 JSON 无法解析。");
  }
  const result = DeepReviewEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    if (fallback.length >= 100) {
      assertDeepReviewStructure(fallback);
      return { markdown: fallback, errorTypes: [] };
    }
    throw new Error(
      result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("；"),
    );
  }
  assertDeepReviewStructure(result.data.markdown);
  return {
    markdown: result.data.markdown.trim(),
    writingScore: result.data.writingScore ?? undefined,
    translationScore: result.data.translationScore ?? undefined,
    errorTypes: [...new Set(result.data.errorTypes.map((item) => item.trim()))],
  };
}

export function buildSingleAnswerReviewMessages(
  kind: "writing" | "translation",
  task: Question,
  answer: string,
): Array<{ role: "system" | "user"; content: string }> {
  const rubric = kind === "writing" ? WRITING_RUBRIC : TRANSLATION_RUBRIC;
  const taskContext =
    kind === "writing"
      ? task.type === "essay"
        ? `写作题目：${task.content}\n写作思路：${task.writingGuidance ?? task.explanation ?? ""}`
        : `写作题目：${task.content}`
      : task.type === "short-answer"
        ? `翻译原文：${task.content}\n参考译文：${task.referenceAnswer}`
        : `翻译题目：${task.content}`;
  return [
    {
      role: "system",
      content: [
        "你是执行 Project_04 六级旧版写译批改流程的阅卷教师。",
        "必须按官方总体印象法先定档、再定档内分；逐句分类只作诊断，不参与计分。",
        "升级稿必须以学生原文为底稿逐句修改，保留原有立场和主要经历，不得另写模板。",
        "所有建议必须写成考场上可执行的肯定动作，并带次数、时间或数量阈值。",
        "不得编造学生原文中没有的经历、数字或事实。只输出简体中文 Markdown。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        rubric,
        "",
        taskContext,
        "",
        `学生原文：\n${answer}`,
        "",
        "输出顺序：",
        `1. 先给“原稿评分：X/15（X 分档，折合 X 分）”，并用档位描述原话说明依据。`,
        kind === "writing"
          ? "2. 用 S1 句法骨架 / S2 语法形态 / S3 搭配用词 / S4 结构衔接 / S5 任务完成逐句诊断。"
          : "2. 用 T1 长句整合 / T2 文化专名 / T3 动词搭配 / T4 语法形态 / T5 绕路策略 / T6 事实性错误逐句诊断。",
        "3. 列出必改三句，每句给出原句和改法。",
        "4. 基于学生原文给出完整升级稿。",
        "5. 给升级稿单独评分：Y/15（Y 分档，折合 Y 分），并明确“离下一档差什么”。",
        "6. 给 3 条带阈值的下一步动作。",
      ].join("\n"),
    },
  ];
}
