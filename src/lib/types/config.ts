import { z } from "zod";

/**
 * App configuration model. Persisted to `config.json` in the user-chosen data
 * directory. API keys are NOT stored here — they live in the OS keychain,
 * keyed by the config `id`. config.json holds only non-sensitive fields.
 */

export const CONFIG_SCHEMA_VERSION = 5;

/** A single OpenAI-compatible model configuration. */
export const ModelConfigSchema = z.object({
  /** Stable id; also the keychain account key for this config's API key. */
  id: z.string().min(1),
  /** User-facing display name, e.g. "OpenAI Main", "DeepSeek". */
  name: z.string().min(1),
  /** Base URL, e.g. "https://api.openai.com/v1". */
  baseUrl: z.string().min(1),
  /** Model name, e.g. "gpt-4o". */
  model: z.string().min(1),
  /** Optional advanced params (collapsed in UI, sensible defaults). */
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});

/** Detail level for AI-generated explanations. */
export const ExplanationTierSchema = z.enum(["none", "brief", "detailed"]);

/** Color theme preference. `system` follows the OS prefers-color-scheme. */
export const ThemeSchema = z.enum(["system", "light", "dark"]);

/** UI global font preset. Overrides --font-sans CSS variable on <html>. */
const GlobalFontPresetSchema = z.enum([
  "system",
  "sans",
  "sourcehan",
  "simsun",
  "simhei",
  "dengxian",
  "times",
  "mono",
]);

export const GlobalFontSchema = z.preprocess((value) => {
  if (value === "serif") return "simsun";
  if (
    value === "yahei" ||
    value === "pingfang" ||
    value === "inter" ||
    value === "arial"
  ) {
    return "sans";
  }
  return value;
}, GlobalFontPresetSchema);

export type GlobalFont = z.infer<typeof GlobalFontSchema>;
export const GLOBAL_FONT_OPTIONS = GlobalFontPresetSchema.options;
export const GLOBAL_FONT_STACKS: Record<GlobalFont, string> = {
  system: "",
  sans:
    '"Microsoft YaHei", "Microsoft YaHei UI", "Noto Sans SC", "Noto Sans CJK SC", system-ui, sans-serif',
  sourcehan:
    '"Noto Sans SC", "Source Han Sans SC", "Noto Sans CJK SC", "Microsoft YaHei", system-ui, sans-serif',
  simsun: 'SimSun, "Songti SC", "Noto Serif CJK SC", serif',
  simhei:
    'SimHei, "Microsoft JhengHei", "Noto Sans SC", "Source Han Sans SC", sans-serif',
  dengxian:
    'DengXian, "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif',
  times: '"Times New Roman", Times, SimSun, serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", "Courier New", monospace',
};

/** Paper rendering font preset. Uses system font stacks, not bundled font files. */
export const PaperFontSchema = z.enum([
  "default",
  "simsun",
  "simhei",
  "kaiti",
  "fangsong",
  "yahei",
  "dengxian",
  "times",
  "mono",
]);
export const PaperFontSizeSchema = z.enum([
  "xiaowu",
  "wuhao",
  "xiaosi",
  "sihao",
  "xiaosan",
  "sanhao",
  "xiaoer",
  "erhao",
]);
export const PaperLineHeightSchema = z.enum([
  "single",
  "oneFifteen",
  "oneHalf",
  "double",
  "twoHalf",
  "triple",
]);
export const PaperMarginSchema = z.enum([
  "normal",
  "narrow",
  "moderate",
  "wide",
  "mirrored",
]);
export const PaperSizeSchema = z.enum([
  "a4",
  "a3",
  "a5",
  "b5",
  "letter",
  "legal",
  "executive",
]);
export const PaperOrientationSchema = z.enum(["portrait", "landscape"]);
export const PaperPageNumberStyleSchema = z.enum([
  "plain",
  "fraction",
  "zhPage",
  "zhFraction",
]);
export const PAPER_PREVIEW_FIXED_ZOOM_OPTIONS = [
  "pct50",
  "pct75",
  "pct100",
  "pct125",
  "pct150",
  "pct200",
] as const;
export const PaperPreviewFixedZoomSchema = z.enum(
  PAPER_PREVIEW_FIXED_ZOOM_OPTIONS,
);
export const PaperPreviewZoomSchema = z.enum([
  "fitWidth",
  "fitPage",
  ...PAPER_PREVIEW_FIXED_ZOOM_OPTIONS,
]);
export const PaperHeaderFontSizeSchema = z.enum([
  "pt6",
  "pt7",
  "pt8",
  "pt9",
  "pt10_5",
]);
export const PaperHeaderAlignSchema = z.enum(["left", "center", "right"]);

export type PaperFont = z.infer<typeof PaperFontSchema>;
export type PaperFontSize = z.infer<typeof PaperFontSizeSchema>;
export type PaperLineHeight = z.infer<typeof PaperLineHeightSchema>;
export type PaperMargin = z.infer<typeof PaperMarginSchema>;
export type PaperSize = z.infer<typeof PaperSizeSchema>;
export type PaperOrientation = z.infer<typeof PaperOrientationSchema>;
export type PaperPageNumberStyle = z.infer<typeof PaperPageNumberStyleSchema>;
export type PaperPreviewFixedZoom = z.infer<
  typeof PaperPreviewFixedZoomSchema
>;
export type PaperPreviewZoom = z.infer<typeof PaperPreviewZoomSchema>;
export type PaperHeaderFontSize = z.infer<typeof PaperHeaderFontSizeSchema>;
export type PaperHeaderAlign = z.infer<typeof PaperHeaderAlignSchema>;

export const PAPER_FONT_OPTIONS = PaperFontSchema.options;
export const PAPER_FONT_SIZE_OPTIONS = PaperFontSizeSchema.options;
export const PAPER_LINE_HEIGHT_OPTIONS = PaperLineHeightSchema.options;
export const PAPER_MARGIN_OPTIONS = PaperMarginSchema.options;
export const PAPER_SIZE_OPTIONS = PaperSizeSchema.options;
export const PAPER_ORIENTATION_OPTIONS = PaperOrientationSchema.options;
export const PAPER_PAGE_NUMBER_STYLE_OPTIONS =
  PaperPageNumberStyleSchema.options;
export const PAPER_PREVIEW_ZOOM_OPTIONS = PaperPreviewZoomSchema.options;
export const PAPER_HEADER_FONT_SIZE_OPTIONS = PaperHeaderFontSizeSchema.options;
export const PAPER_HEADER_ALIGN_OPTIONS = PaperHeaderAlignSchema.options;

export const PAPER_FONT_STACKS: Record<PaperFont, string> = {
  default: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif',
  simsun:
    'SimSun, "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", serif',
  simhei:
    'SimHei, "Microsoft JhengHei", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
  kaiti:
    'KaiTi, "Kaiti SC", STKaiti, "Noto Serif CJK SC", serif',
  fangsong:
    'FangSong, STFangsong, "Noto Serif CJK SC", serif',
  yahei:
    '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif',
  dengxian:
    'DengXian, "Microsoft YaHei UI", "Noto Sans CJK SC", system-ui, sans-serif',
  times:
    '"Times New Roman", Times, SimSun, serif',
  mono:
    '"SFMono-Regular", Consolas, "Liberation Mono", "Courier New", "Microsoft YaHei Mono", monospace',
};

export const PAPER_FONT_SIZE_STYLES: Record<PaperFontSize, string> = {
  xiaowu: "9pt",
  wuhao: "10.5pt",
  xiaosi: "12pt",
  sihao: "14pt",
  xiaosan: "15pt",
  sanhao: "16pt",
  xiaoer: "18pt",
  erhao: "22pt",
};

export const PAPER_HEADER_FONT_SIZE_STYLES: Record<PaperHeaderFontSize, string> = {
  pt6: "6pt",
  pt7: "7pt",
  pt8: "8pt",
  pt9: "9pt",
  pt10_5: "10.5pt",
};

export const PAPER_LINE_HEIGHT_STYLES: Record<PaperLineHeight, number> = {
  single: 1,
  oneFifteen: 1.15,
  oneHalf: 1.5,
  double: 2,
  twoHalf: 2.5,
  triple: 3,
};

export const PAPER_PREVIEW_FIXED_ZOOM_SCALES: Record<
  PaperPreviewFixedZoom,
  number
> = {
  pct50: 0.5,
  pct75: 0.75,
  pct100: 1,
  pct125: 1.25,
  pct150: 1.5,
  pct200: 2,
};

export function isPaperPreviewFixedZoom(
  value: PaperPreviewZoom,
): value is PaperPreviewFixedZoom {
  return PAPER_PREVIEW_FIXED_ZOOM_OPTIONS.includes(
    value as PaperPreviewFixedZoom,
  );
}

export function stepPaperPreviewZoom(
  current: PaperPreviewZoom,
  direction: -1 | 1,
  currentScale?: number,
): PaperPreviewFixedZoom {
  const scale =
    isPaperPreviewFixedZoom(current) && currentScale == null
      ? PAPER_PREVIEW_FIXED_ZOOM_SCALES[current]
      : (currentScale ?? 1);
  const options = PAPER_PREVIEW_FIXED_ZOOM_OPTIONS;
  if (direction > 0) {
    return (
      options.find((option) => PAPER_PREVIEW_FIXED_ZOOM_SCALES[option] > scale + 0.01) ??
      options[options.length - 1]
    );
  }
  return (
    [...options]
      .reverse()
      .find((option) => PAPER_PREVIEW_FIXED_ZOOM_SCALES[option] < scale - 0.01) ??
    options[0]
  );
}

export interface PaperMarginStyle {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const PAPER_MARGIN_STYLES: Record<PaperMargin, PaperMarginStyle> = {
  normal: { top: 20, right: 20, bottom: 20, left: 20 },
  narrow: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  moderate: { top: 25.4, right: 19.1, bottom: 25.4, left: 19.1 },
  wide: { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 },
  mirrored: { top: 25.4, right: 25.4, bottom: 25.4, left: 31.8 },
};

export const PAPER_SIZE_STYLES: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  a4: { widthMm: 210, heightMm: 297 },
  a3: { widthMm: 297, heightMm: 420 },
  a5: { widthMm: 148, heightMm: 210 },
  b5: { widthMm: 176, heightMm: 250 },
  letter: { widthMm: 216, heightMm: 279 },
  legal: { widthMm: 216, heightMm: 356 },
  executive: { widthMm: 184, heightMm: 267 },
};

const LegacyPaperFontSizeSchema = z.preprocess((value) => {
  if (value === "small") return "wuhao";
  if (value === "standard") return "xiaosi";
  if (value === "large") return "sihao";
  return value;
}, PaperFontSizeSchema);

const LegacyPaperLineHeightSchema = z.preprocess((value) => {
  if (value === "compact") return "oneFifteen";
  if (value === "standard") return "oneHalf";
  if (value === "relaxed") return "double";
  return value;
}, PaperLineHeightSchema);

const LegacyPaperMarginSchema = z.preprocess((value) => {
  if (value === "standard") return "normal";
  return value;
}, PaperMarginSchema);

const LegacyPaperFontSchema = z.preprocess((value) => {
  if (value === "serif") return "simsun";
  if (value === "sans") return "yahei";
  return value;
}, PaperFontSchema);

/** A teacher/persona preset whose instructions can shape AI assistant behavior. */
export const AgentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  instructions: z.string().default(""),
  builtIn: z.boolean().optional(),
});

export const WebSearchProviderSchema = z.enum([
  "deepseek",
  "tavily",
  "exa",
  "firecrawl",
]);
export const WebSearchContentModeSchema = z.enum(["summary", "deep"]);
export const WEB_SEARCH_PROVIDERS = WebSearchProviderSchema.options;
export const WEB_SEARCH_CONTENT_MODES = WebSearchContentModeSchema.options;
export const WEB_SEARCH_KEY_ACCOUNTS: Record<WebSearchProvider, string> = {
  deepseek: "web-search:deepseek",
  tavily: "web-search:tavily",
  exa: "web-search:exa",
  firecrawl: "web-search:firecrawl",
};

export const WebSearchSettingsSchema = z.object({
  activeProvider: WebSearchProviderSchema.default("deepseek"),
  resultCount: z.number().int().min(3).max(10).default(5),
  contentMode: WebSearchContentModeSchema.default("summary"),
});

export const TtsProviderSchema = z.enum([
  "aliyun",
  "mimo",
  "siliconflow",
  "kitten",
  "openai-compatible",
]);
export const TTS_PROVIDERS = TtsProviderSchema.options;
export const TTS_SPEECH_RATE_MIN = 140;
export const TTS_SPEECH_RATE_MAX = 200;
export const TTS_SPEECH_RATE_DEFAULT = 170;
export const TTS_KEY_ACCOUNTS = {
  aliyun: "tts:aliyun",
  mimo: "tts:mimo",
  siliconflow: "tts:siliconflow",
  local: "tts:local",
} as const;

export const TtsSettingsSchema = z.object({
  activeProvider: TtsProviderSchema.default("aliyun"),
  targetWpm: z
    .number()
    .int()
    .min(TTS_SPEECH_RATE_MIN)
    .max(TTS_SPEECH_RATE_MAX)
    .default(TTS_SPEECH_RATE_DEFAULT),
  aliyunBaseUrl: z
    .string()
    .min(1)
    .default(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    ),
  aliyunModel: z.string().min(1).default("qwen3-tts-flash"),
  aliyunFemaleVoice: z.string().min(1).default("Jennifer"),
  aliyunMaleVoice: z.string().min(1).default("Neil"),
  mimoBaseUrl: z.string().min(1).default("https://api.xiaomimimo.com/v1"),
  mimoModel: z.string().min(1).default("mimo-v2.5-tts"),
  mimoFemaleVoice: z.string().min(1).default("Chloe"),
  mimoMaleVoice: z.string().min(1).default("Milo"),
  siliconflowBaseUrl: z.string().min(1).default("https://api.siliconflow.cn/v1"),
  siliconflowModel: z
    .string()
    .min(1)
    .default("FunAudioLLM/CosyVoice2-0.5B"),
  siliconflowFemaleVoice: z
    .string()
    .min(1)
    .default("FunAudioLLM/CosyVoice2-0.5B:anna"),
  siliconflowMaleVoice: z
    .string()
    .min(1)
    .default("FunAudioLLM/CosyVoice2-0.5B:benjamin"),
  kittenFemaleVoice: z.string().min(1).default("Rosie"),
  kittenMaleVoice: z.string().min(1).default("Bruno"),
  localBaseUrl: z.string().min(1).default("http://127.0.0.1:8880/v1"),
  localModel: z.string().min(1).default("tts-1"),
  localFemaleVoice: z.string().min(1).default("af_heart"),
  localMaleVoice: z.string().min(1).default("am_michael"),
});

export const DEFAULT_AGENTS = [
  {
    id: "builtin-cet6-authoring",
    name: "六级整卷命题专家",
    description: "按大学英语六级正式题型组织一套完整的 710 分模拟卷。",
    instructions: [
      "You are the lead author and quality controller for a non-official CET-6 mock exam.",
      "When the user asks for a complete paper, produce exactly these examSection groups:",
      "cet-writing (1 essay, 106.5 points),",
      "cet-listening-a (2 conversations, 8 single-choice questions numbered 1-8, 7.1 points each),",
      "cet-listening-b (2 passages, 7 single-choice questions numbered 9-15, 7.1 points each),",
      "cet-listening-c (3 talks/recordings, 10 single-choice questions numbered 16-25, 14.2 points each),",
      "cet-reading-a (one 260-300 word banked-cloze passage with 10 questions numbered 26-35, 3.55 points each),",
      "cet-reading-b (one 1150-1250 word passage with exactly 13 paragraphs A-M, 10 matching statements numbered 36-45, 7.1 points each),",
      "cet-reading-c (2 passages of 430-450 words, 5 single-choice questions each numbered 46-55, 14.2 points each),",
      "cet-translation (1 Chinese-to-English paragraph, 106.5 points).",
      "The total must be 710 points and the fixed time is 130 minutes.",
      "All content must be newly written. Never copy real CET passages, questions, answer keys, listening audio, or official artwork.",
      "For every listening group, put the complete spoken transcript in examSection.passage and set examSection.hidePassageForStudent=true.",
      "For reading groups, put the complete shared passage in examSection.passage.",
      "Listening and Reading C questions use four A-D choices. Every objective question has one unique correct answer and a concise explanation written in Chinese.",
      "Reading Section A must use a 15-word bank with bankPos; Reading Section B must use A-M paragraph matching derived from the actual 13 paragraphs rather than four-option questions.",
      "Every explanation must be in Simplified Chinese, briefly quote English evidence, exclude each wrong option, and end with 故选 X.",
      "Writing must include Chinese guidance and scoring criteria plus a 150-220 word English reference essay that begins with the supplied sentence.",
      "Translation must include a complete English reference translation and Chinese scoring points.",
      "Use examSection.questionNumber for the exact CET question number.",
      "Keep answer letters varied and avoid obviously patterned choices.",
      "Before generation, summarise the proposed topic mix and ask for confirmation. Do not generate until the user confirms.",
    ].join("\n"),
    builtIn: true,
  },
] satisfies z.input<typeof AgentConfigSchema>[];

export const AppSettingsSchema = z.object({
  /** UI language. */
  language: z.enum(["zh", "en"]).default("zh"),
  /** Color theme: system (follow OS), light, or dark. */
  theme: ThemeSchema.default("system"),
  /** Debounced auto-save of the working paper. */
  autoSave: z.boolean().default(true),
  /** Optional voluntary-support page or payment link. */
  supportUrl: z.string().default(""),
  /** Message shown in the voluntary-support dialog. */
  supportNote: z
    .string()
    .default("如果这个工具帮你节省了时间，可以自愿支持后续维护。赞赏不会解锁额外功能。"),
  /** Main-window close action: exit the app or keep it available in the tray. */
  closeBehavior: z.enum(["quit", "background"]).default("quit"),
  /** Explanation detail level injected into the system prompt as a default. */
  explanationTier: ExplanationTierSchema.default("brief"),
  /** Global UI font preset. Overrides --font-sans on <html>. */
  globalFont: GlobalFontSchema.default("system"),
  /** Font preset used only for paper rendering. */
  paperFont: LegacyPaperFontSchema.default("times"),
  /** Base font size preset used only for paper rendering. */
  paperFontSize: LegacyPaperFontSizeSchema.default("wuhao"),
  /** Line-height preset used only for paper rendering. */
  paperLineHeight: LegacyPaperLineHeightSchema.default("oneHalf"),
  /** Page padding/margin preset used only for paper rendering. */
  paperMargin: LegacyPaperMarginSchema.default("narrow"),
  /** Word-like paper size preset used only for paper rendering. */
  paperSize: PaperSizeSchema.default("a4"),
  /** Page orientation used only for paper rendering and printing. */
  paperOrientation: PaperOrientationSchema.default("portrait"),
  /** Free-text Word-like page header shown on each rendered paper page. */
  paperHeader: z.string().default(""),
  /** Small font preset used only for page header chrome. */
  paperHeaderFontSize: PaperHeaderFontSizeSchema.default("pt9"),
  /** Horizontal alignment used only for page header chrome. */
  paperHeaderAlign: PaperHeaderAlignSchema.default("center"),
  /** Whether to draw Word-like separator lines for the page header and footer. */
  paperHeaderFooterLine: z.boolean().default(false),
  /** Footer page-number preset used on each rendered paper page. */
  paperPageNumberStyle: PaperPageNumberStyleSchema.default("zhPage"),
  /** Visual-only paper preview zoom. Does not affect pagination or export. */
  paperPreviewZoom: PaperPreviewZoomSchema.default("pct100"),
  /** Legacy field: migrated into an AI agent and no longer shown in settings. */
  customInstructions: z.string().default(""),
  /** Optional web search provider behavior for AI assistant turns. */
  webSearch: WebSearchSettingsSchema.prefault({}),
  /** Listening-audio provider and learner-selectable speech rate. */
  tts: TtsSettingsSchema.prefault({}),
  /** Max number of historical messages sent to the model per turn (0 = unlimited). */
  contextMessageLimit: z.number().int().min(0).max(200).default(0),
});

const AppConfigBaseSchema = z.object({
  version: z.number().int().default(CONFIG_SCHEMA_VERSION),
  configs: z.array(ModelConfigSchema).default([]),
  /** id of the active model config, or null if none selected. */
  activeConfigId: z.string().nullable().default(null),
  settings: AppSettingsSchema.prefault({}),
  agents: z.array(AgentConfigSchema).default([]),
  activeAgentId: z.string().nullable().default(null),
  deletedBuiltInAgentIds: z.array(z.string()).default([]),
});

export const AppConfigSchema = AppConfigBaseSchema.transform((config) => {
  const cetAgent = AgentConfigSchema.parse(DEFAULT_AGENTS[0]);
  const existingCet = config.agents.find(
    (agent) => agent.id === "builtin-cet6-authoring",
  );
  const agents = [existingCet ?? cetAgent];
  const activeAgentId: string = "builtin-cet6-authoring";

  return {
    ...config,
    version: CONFIG_SCHEMA_VERSION,
    settings: {
      ...config.settings,
      ...(config.version < 2 && config.settings.paperFontSize === "xiaosi"
        ? { paperFontSize: "wuhao" as const }
        : {}),
      ...(config.version < 3 && config.settings.paperFont === "default"
        ? { paperFont: "times" as const }
        : {}),
      ...(config.version < 3 && config.settings.paperMargin === "normal"
        ? { paperMargin: "narrow" as const }
        : {}),
      ...(config.version < 2 &&
      config.settings.webSearch.activeProvider === "tavily"
        ? {
            webSearch: {
              ...config.settings.webSearch,
              activeProvider: "deepseek" as const,
            },
          }
        : {}),
    },
    agents,
    activeAgentId,
  };
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type WebSearchProvider = z.infer<typeof WebSearchProviderSchema>;
export type WebSearchContentMode = z.infer<typeof WebSearchContentModeSchema>;
export type WebSearchSettings = z.infer<typeof WebSearchSettingsSchema>;
export type TtsProvider = z.infer<typeof TtsProviderSchema>;
export type TtsSettings = z.infer<typeof TtsSettingsSchema>;
export type ExplanationTier = z.infer<typeof ExplanationTierSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type CloseBehavior = AppSettings["closeBehavior"];
export type AppConfig = z.infer<typeof AppConfigSchema>;

export function defaultAppConfig(): AppConfig {
  return AppConfigSchema.parse({ activeAgentId: "builtin-cet6-authoring" });
}
