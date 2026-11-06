import type { AiPaperOperation, QuestionType } from "../types/exam";

export type QuestionTypeStrategyId =
  | "cet6"
  | "english-language"
  | "chinese-language"
  | "mathematics"
  | "science"
  | "humanities";

export interface QuestionTypeStrategy {
  id: QuestionTypeStrategyId;
  label: string;
  detectKeywords: readonly string[];
  preferredTypes: readonly QuestionType[];
  defaultExcludedTypes: readonly QuestionType[];
  sectionLabels?: Partial<Record<QuestionType, string>>;
  sectionKinds?: readonly string[];
  sectionKindLabels?: Partial<Record<string, string>>;
  guidance: readonly string[];
}

export interface QuestionTypeStrategyContext {
  requestText?: string;
  paperSummary?: string;
}

export interface QuestionTypeStrategyMatch {
  strategy: QuestionTypeStrategy;
  evidence: readonly string[];
  explicitlyAllowedTypes: readonly QuestionType[];
}

const ALL_QUESTION_TYPES: readonly QuestionType[] = [
  "single-choice",
  "multiple-choice",
  "true-false",
  "fill-in-blank",
  "short-answer",
  "essay",
  "calculation",
];

export const QUESTION_TYPE_STRATEGIES: readonly QuestionTypeStrategy[] = [
  {
    id: "cet6",
    label: "CET-6 complete mock paper",
    detectKeywords: [
      "CET-6",
      "CET6",
      "大学英语六级",
      "六级模拟卷",
      "六级整卷",
    ],
    preferredTypes: ["single-choice", "fill-in-blank", "short-answer", "essay"],
    defaultExcludedTypes: ["multiple-choice", "true-false", "calculation"],
    sectionLabels: {
      "single-choice": "选择题",
      "fill-in-blank": "选词填空",
      "short-answer": "翻译",
      essay: "写作",
    },
    sectionKinds: [
      "cet-writing",
      "cet-listening-a",
      "cet-listening-b",
      "cet-listening-c",
      "cet-reading-a",
      "cet-reading-b",
      "cet-reading-c",
      "cet-translation",
    ],
    sectionKindLabels: {
      "cet-writing": "Part I　Writing　(30 minutes)",
      "cet-listening-a": "Part II　Listening Comprehension · Section A",
      "cet-listening-b": "Part II　Listening Comprehension · Section B",
      "cet-listening-c": "Part II　Listening Comprehension · Section C",
      "cet-reading-a": "Part III　Reading Comprehension · Section A",
      "cet-reading-b": "Part III　Reading Comprehension · Section B",
      "cet-reading-c": "Part III　Reading Comprehension · Section C",
      "cet-translation": "Part IV　Translation",
    },
    guidance: [
      "This is a fixed-format CET-6 mock paper, not a generic English worksheet.",
      "Generate the exact section totals and question numbers requested by the active authoring agent.",
      "Listening questions must be single-choice and every listening passage must contain a complete, natural spoken transcript.",
      "Reading C must be two separate passages with exactly five questions each.",
      "The translation task is Chinese-to-English and uses short-answer with a complete reference translation.",
      "Never claim official affiliation and never reproduce real CET material.",
    ],
  },
  {
    id: "english-language",
    label: "English language paper",
    detectKeywords: [
      "英语",
      "英文",
      "english",
      "grammar",
      "vocabulary",
      "reading comprehension",
      "cloze",
    ],
    preferredTypes: [
      "single-choice",
      "short-answer",
      "essay",
    ],
    defaultExcludedTypes: ["true-false", "fill-in-blank", "calculation"],
    sectionLabels: {
      "single-choice": "语法与词汇单选",
      "short-answer": "翻译",
      essay: "作文",
    },
    sectionKinds: [
      "english-vocabulary-choice",
      "english-cloze",
      "english-reading",
      "english-translation",
      "english-composition",
    ],
    sectionKindLabels: {
      "english-vocabulary-choice": "语法与词汇单选",
      "english-cloze": "完形填空",
      "english-reading": "阅读理解",
      "english-translation": "翻译",
      "english-composition": "作文",
    },
    guidance: [
      "Default to English exam sections: grammar/vocabulary choice, cloze, reading comprehension, translation, and composition.",
      "For grammar/vocabulary choice, keep each item as a short stem with options in the options array; do not embed A/B/C/D in content.",
      "For cloze, use single-choice questions with examSection.kind='english-cloze', the same groupId, and the shared cloze passage in examSection.passage; each blank should be a numbered choice item with options in the options array.",
      "For reading comprehension, use single-choice questions with examSection.kind='english-reading', the same groupId, and the shared reading passage in examSection.passage; do not model reading comprehension as true-false unless the user explicitly asks for judging statements.",
      "For translation, use short-answer questions with examSection.kind='english-translation' and a referenceAnswer.",
      "Use essay as English composition or written expression, with clear scoring criteria.",
      "Use fill-in-blank only when the user explicitly asks for isolated blank-filling; default cloze should be grouped single-choice instead.",
      "Never use calculation unless the user explicitly asks for a cross-subject math-in-English task.",
    ],
  },
  {
    id: "chinese-language",
    label: "Chinese language paper",
    detectKeywords: ["语文", "中文", "汉语", "作文", "古诗", "文言文", "阅读理解"],
    preferredTypes: [
      "single-choice",
      "fill-in-blank",
      "short-answer",
      "essay",
    ],
    defaultExcludedTypes: ["calculation"],
    guidance: [
      "Use language knowledge, reading comprehension, classical text, short-answer, and composition tasks as appropriate.",
      "Use calculation only when the user explicitly asks for cross-subject quantitative content.",
    ],
  },
  {
    id: "mathematics",
    label: "Mathematics paper",
    detectKeywords: [
      "数学",
      "math",
      "mathematics",
      "代数",
      "几何",
      "函数",
      "方程",
      "应用题",
      "calculus",
      "algebra",
      "geometry",
    ],
    preferredTypes: [
      "single-choice",
      "multiple-choice",
      "fill-in-blank",
      "calculation",
    ],
    defaultExcludedTypes: ["essay"],
    guidance: [
      "Prioritize calculable and checkable tasks: choice, fill-in-blank, calculation, proof-like solution, and application problems.",
      "Use essay only when the user explicitly asks for a mathematical discussion or reflection task.",
    ],
  },
  {
    id: "science",
    label: "Science paper",
    detectKeywords: [
      "物理",
      "化学",
      "生物",
      "科学",
      "physics",
      "chemistry",
      "biology",
      "science",
      "实验",
    ],
    preferredTypes: [
      "single-choice",
      "multiple-choice",
      "true-false",
      "fill-in-blank",
      "short-answer",
      "calculation",
    ],
    defaultExcludedTypes: ["essay"],
    guidance: [
      "Mix concept checks, experiment understanding, short-answer reasoning, and calculations when appropriate for the subject.",
      "Use essay only when the user explicitly asks for a long-form scientific discussion.",
    ],
  },
  {
    id: "humanities",
    label: "Humanities or social studies paper",
    detectKeywords: [
      "历史",
      "地理",
      "政治",
      "道德与法治",
      "社会",
      "history",
      "geography",
      "politics",
      "civics",
    ],
    preferredTypes: [
      "single-choice",
      "multiple-choice",
      "true-false",
      "fill-in-blank",
      "short-answer",
      "essay",
    ],
    defaultExcludedTypes: ["calculation"],
    guidance: [
      "Use factual checks, map/source interpretation, short-answer explanation, and essay-style analysis where appropriate.",
      "Use calculation only when the user explicitly asks for quantitative geography or statistics content.",
    ],
  },
];

const EXPLICIT_TYPE_KEYWORDS: Record<QuestionType, readonly string[]> = {
  "single-choice": ["单选", "选择题", "single choice", "multiple choice"],
  "multiple-choice": ["多选", "multiple choice"],
  "true-false": ["判断", "true false", "true/false"],
  "fill-in-blank": ["填空", "fill in"],
  "short-answer": [
    "简答",
    "问答",
    "回答问题",
    "翻译",
    "translation",
    "written answer",
    "short answer",
    "open response",
  ],
  essay: ["论述", "作文", "写作", "essay", "composition", "writing"],
  calculation: ["计算", "解答题", "应用题", "calculation", "calculate", "solve"],
};

export function inferQuestionTypeStrategy(
  context: QuestionTypeStrategyContext,
): QuestionTypeStrategyMatch | null {
  const text = normalize(`${context.requestText ?? ""}\n${context.paperSummary ?? ""}`);
  if (!text) return null;

  const candidates = QUESTION_TYPE_STRATEGIES.map((strategy) => {
    const evidence = strategy.detectKeywords.filter((keyword) =>
      text.includes(normalize(keyword)),
    );
    return { strategy, evidence };
  })
    .filter((candidate) => candidate.evidence.length > 0)
    .sort((a, b) => {
      if (b.evidence.length !== a.evidence.length) {
        return b.evidence.length - a.evidence.length;
      }
      return strategyPriority(b.strategy.id) - strategyPriority(a.strategy.id);
    });

  const best = candidates[0];
  if (!best) return null;

  return {
    strategy: best.strategy,
    evidence: best.evidence,
    explicitlyAllowedTypes: explicitTypes(text),
  };
}

function strategyPriority(id: QuestionTypeStrategyId): number {
  return id === "cet6" ? 100 : 0;
}

export function formatQuestionTypeStrategy(
  match: QuestionTypeStrategyMatch | null,
): string | null {
  if (!match) return null;

  const { strategy } = match;
  return [
    "# Question type strategy",
    `Detected context: ${strategy.label}.`,
    `Preferred question types: ${strategy.preferredTypes.join(", ")}.`,
    `Default-excluded question types: ${strategy.defaultExcludedTypes.join(", ")}.`,
    "Use default-excluded types only when the user explicitly asks for that type or task format.",
    formatSectionKinds(strategy),
    formatSectionLabels(strategy),
    ...strategy.guidance.map((line) => `- ${line}`),
  ]
    .filter(Boolean)
    .join("\n");
}

export function validateQuestionTypeStrategy(
  operations: readonly AiPaperOperation[],
  match: QuestionTypeStrategyMatch | null,
): { ok: true } | { ok: false; error: string } {
  if (!match) return { ok: true };

  const excluded = new Set(match.strategy.defaultExcludedTypes);
  const explicit = new Set(match.explicitlyAllowedTypes);
  const violations: string[] = [];

  for (const question of generatedQuestions(operations)) {
    if (excluded.has(question.type) && !explicit.has(question.type)) {
      violations.push(`- ${question.id}: ${question.type}`);
    }
  }

  if (violations.length === 0) return { ok: true };

  return {
    ok: false,
    error: [
      `Question types do not fit the detected ${match.strategy.label} strategy.`,
      `Default-excluded types for this context: ${match.strategy.defaultExcludedTypes.join(", ")}.`,
      "Violations:",
      ...violations,
      "Regenerate with preferred/allowed types, unless the user explicitly requested the excluded type.",
    ].join("\n"),
  };
}

function generatedQuestions(operations: readonly AiPaperOperation[]) {
  return operations.flatMap((operation) => {
    switch (operation.type) {
      case "appendQuestions":
        return operation.questions;
      case "updateQuestion":
        return [operation.question];
      case "renamePaper":
      case "deleteQuestion":
      case "reorderQuestions":
        return [];
    }
  });
}

function explicitTypes(text: string): QuestionType[] {
  return ALL_QUESTION_TYPES.filter((type) =>
    EXPLICIT_TYPE_KEYWORDS[type].some((keyword) => text.includes(normalize(keyword))),
  );
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function formatSectionLabels(strategy: QuestionTypeStrategy): string {
  const labels = Object.entries(strategy.sectionLabels ?? {});
  if (labels.length === 0) return "";
  return `Contextual section labels: ${labels
    .map(([type, label]) => `${type}=${label}`)
    .join(", ")}.`;
}

function formatSectionKinds(strategy: QuestionTypeStrategy): string {
  if (!strategy.sectionKinds?.length) return "";
  return `Subject-specific examSection kinds: ${strategy.sectionKinds
    .map((kind) => {
      const label = strategy.sectionKindLabels?.[kind];
      return label ? `${kind}=${label}` : kind;
    })
    .join(", ")}.`;
}
