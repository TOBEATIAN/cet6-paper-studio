import { describe, expect, it } from "vitest";
import {
  AppConfigSchema,
  DEFAULT_AGENTS,
  defaultAppConfig,
  GLOBAL_FONT_OPTIONS,
  GLOBAL_FONT_STACKS,
  TTS_KEY_ACCOUNTS,
  WEB_SEARCH_KEY_ACCOUNTS,
} from "../types/config";

describe("AppConfigSchema", () => {
  it("defaults paper font for fresh config", () => {
    const config = AppConfigSchema.parse({});
    expect(config.settings.paperFont).toBe("times");
    expect(config.settings.paperFontSize).toBe("wuhao");
    expect(config.settings.paperLineHeight).toBe("oneHalf");
    expect(config.settings.paperMargin).toBe("narrow");
    expect(config.settings.paperSize).toBe("a4");
    expect(config.settings.paperOrientation).toBe("portrait");
    expect(config.settings.paperHeader).toBe("");
    expect(config.settings.paperHeaderFontSize).toBe("pt9");
    expect(config.settings.paperHeaderAlign).toBe("center");
    expect(config.settings.paperHeaderFooterLine).toBe(false);
    expect(config.settings.paperPageNumberStyle).toBe("zhPage");
    expect(config.settings.paperPreviewZoom).toBe("pct100");
    expect(config.settings.closeBehavior).toBe("quit");
    expect(config.settings.supportUrl).toBe("");
  });

  it("loads old settings without paper layout presets", () => {
    const config = AppConfigSchema.parse({
      settings: {
        language: "en",
        theme: "dark",
        autoSave: false,
        explanationTier: "detailed",
      },
    });

    expect(config.settings.paperFont).toBe("times");
    expect(config.settings.paperFontSize).toBe("wuhao");
    expect(config.settings.paperLineHeight).toBe("oneHalf");
    expect(config.settings.paperMargin).toBe("narrow");
    expect(config.settings.paperSize).toBe("a4");
    expect(config.settings.paperOrientation).toBe("portrait");
    expect(config.settings.paperHeader).toBe("");
    expect(config.settings.paperHeaderFontSize).toBe("pt9");
    expect(config.settings.paperHeaderAlign).toBe("center");
    expect(config.settings.paperHeaderFooterLine).toBe(false);
    expect(config.settings.paperPageNumberStyle).toBe("zhPage");
    expect(config.settings.paperPreviewZoom).toBe("pct100");
    expect(config.settings.language).toBe("en");
  });

  it("migrates the former default paper font and margins to CET exam layout", () => {
    const config = AppConfigSchema.parse({
      version: 2,
      settings: {
        paperFont: "default",
        paperMargin: "normal",
      },
    });

    expect(config.version).toBe(5);
    expect(config.settings.paperFont).toBe("times");
    expect(config.settings.paperMargin).toBe("narrow");
  });

  it("accepts every global font preset and has a stack for each one", () => {
    expect(GLOBAL_FONT_OPTIONS).toEqual([
      "system",
      "sans",
      "sourcehan",
      "simsun",
      "simhei",
      "dengxian",
      "times",
      "mono",
    ]);

    for (const globalFont of GLOBAL_FONT_OPTIONS) {
      const config = AppConfigSchema.parse({ settings: { globalFont } });
      expect(config.settings.globalFont).toBe(globalFont);
      expect(GLOBAL_FONT_STACKS).toHaveProperty(globalFont);
    }
  });

  it("maps removed global font presets to effective visible presets", () => {
    expect(
      AppConfigSchema.parse({ settings: { globalFont: "serif" } }).settings
        .globalFont,
    ).toBe("simsun");
    for (const legacy of ["yahei", "pingfang", "inter", "arial"]) {
      expect(
        AppConfigSchema.parse({ settings: { globalFont: legacy } }).settings
          .globalFont,
      ).toBe("sans");
    }
  });

  it("keeps configured paper layout presets", () => {
    const config = AppConfigSchema.parse({
      settings: {
        paperFont: "fangsong",
        paperFontSize: "xiaoer",
        paperLineHeight: "double",
        paperMargin: "wide",
        paperSize: "legal",
        paperOrientation: "landscape",
        paperHeader: "期末考试",
        paperHeaderFontSize: "pt8",
        paperHeaderAlign: "right",
        paperHeaderFooterLine: true,
        paperPageNumberStyle: "zhFraction",
        paperPreviewZoom: "fitWidth",
      },
    });

    expect(config.settings.paperFont).toBe("fangsong");
    expect(config.settings.paperFontSize).toBe("xiaoer");
    expect(config.settings.paperLineHeight).toBe("double");
    expect(config.settings.paperMargin).toBe("wide");
    expect(config.settings.paperSize).toBe("legal");
    expect(config.settings.paperOrientation).toBe("landscape");
    expect(config.settings.paperHeader).toBe("期末考试");
    expect(config.settings.paperHeaderFontSize).toBe("pt8");
    expect(config.settings.paperHeaderAlign).toBe("right");
    expect(config.settings.paperHeaderFooterLine).toBe(true);
    expect(config.settings.paperPageNumberStyle).toBe("zhFraction");
    expect(config.settings.paperPreviewZoom).toBe("fitWidth");
  });

  it("maps old paper font size presets and ignores old text alignment", () => {
    const config = AppConfigSchema.parse({
      settings: {
        paperFontSize: "large",
        paperTextAlign: "justify",
      },
    });

    expect(config.settings.paperFontSize).toBe("sihao");
    expect(config.settings.paperSize).toBe("a4");
    expect("paperTextAlign" in config.settings).toBe(false);
  });

  it("maps old paper line height and margin presets to Word-like presets", () => {
    expect(
      AppConfigSchema.parse({ settings: { paperLineHeight: "compact" } })
        .settings.paperLineHeight,
    ).toBe("oneFifteen");
    expect(
      AppConfigSchema.parse({ settings: { paperLineHeight: "relaxed" } })
        .settings.paperLineHeight,
    ).toBe("double");
    expect(
      AppConfigSchema.parse({ settings: { paperMargin: "standard" } }).settings
        .paperMargin,
    ).toBe("normal");
  });

  it("maps old paper font presets to practical Chinese fonts", () => {
    expect(
      AppConfigSchema.parse({ settings: { paperFont: "serif" } }).settings.paperFont,
    ).toBe("simsun");
    expect(
      AppConfigSchema.parse({ settings: { paperFont: "sans" } }).settings.paperFont,
    ).toBe("yahei");
  });

  it("adds default AI agents when config has none", () => {
    const config = AppConfigSchema.parse({});
    expect(config.agents.map((agent) => agent.id)).toEqual(
      DEFAULT_AGENTS.map((agent) => agent.id),
    );
    expect(config.activeAgentId).toBe("builtin-cet6-authoring");
  });

  it("activates the CET-6 authoring agent for a fresh app", () => {
    const config = defaultAppConfig();
    expect(config.activeAgentId).toBe("builtin-cet6-authoring");
    expect(
      config.agents.find((agent) => agent.id === "builtin-cet6-authoring")
        ?.instructions,
    ).toContain("710 points");
  });

  it("removes unrelated agents from persisted config", () => {
    const config = AppConfigSchema.parse({
      agents: [
        {
          id: "custom-agent",
          name: "Physics Teacher",
          description: "",
          instructions: "Prefer experiments.",
        },
      ],
      activeAgentId: "custom-agent",
    });
    expect(config.agents.map((agent) => agent.id)).toEqual([
      "builtin-cet6-authoring",
    ]);
    expect(config.activeAgentId).toBe("builtin-cet6-authoring");
  });

  it("does not restore deleted built-in agents", () => {
    const config = AppConfigSchema.parse({
      deletedBuiltInAgentIds: ["builtin-math-teacher"],
    });
    expect(config.agents.map((agent) => agent.id)).not.toContain(
      "builtin-math-teacher",
    );
  });

  it("restores the CET-6 agent when the active id is invalid", () => {
    const config = AppConfigSchema.parse({ activeAgentId: "missing-agent" });
    expect(config.activeAgentId).toBe("builtin-cet6-authoring");
  });

  it("drops legacy custom-instruction agents in the CET-only product", () => {
    const config = AppConfigSchema.parse({
      settings: { customInstructions: "Always use metric units." },
    });
    expect(config.agents.map((agent) => agent.id)).toEqual([
      "builtin-cet6-authoring",
    ]);
  });

  it("defaults web search settings for fresh config", () => {
    const config = AppConfigSchema.parse({});
    expect(config.settings.webSearch).toEqual({
      activeProvider: "deepseek",
      resultCount: 5,
      contentMode: "summary",
    });
  });

  it("validates web search result count bounds", () => {
    expect(() =>
      AppConfigSchema.parse({ settings: { webSearch: { resultCount: 2 } } }),
    ).toThrow();
    expect(() =>
      AppConfigSchema.parse({ settings: { webSearch: { resultCount: 11 } } }),
    ).toThrow();
  });

  it("uses prefixed keychain accounts for web search keys", () => {
    expect(WEB_SEARCH_KEY_ACCOUNTS).toEqual({
      deepseek: "web-search:deepseek",
      tavily: "web-search:tavily",
      exa: "web-search:exa",
      firecrawl: "web-search:firecrawl",
    });
  });

  it("defaults listening audio to Aliyun at 170 wpm with exam-like voices", () => {
    const tts = AppConfigSchema.parse({}).settings.tts;
    expect(tts.activeProvider).toBe("aliyun");
    expect(tts.targetWpm).toBe(170);
    expect(tts.aliyunFemaleVoice).toBe("Jennifer");
    expect(tts.aliyunMaleVoice).toBe("Neil");
    expect(tts.mimoFemaleVoice).toBe("Chloe");
    expect(tts.mimoMaleVoice).toBe("Milo");
    expect(tts.kittenFemaleVoice).toBe("Rosie");
    expect(tts.kittenMaleVoice).toBe("Bruno");
  });

  it("limits the selectable speech rate to the training range", () => {
    expect(() =>
      AppConfigSchema.parse({ settings: { tts: { targetWpm: 139 } } }),
    ).toThrow();
    expect(() =>
      AppConfigSchema.parse({ settings: { tts: { targetWpm: 201 } } }),
    ).toThrow();
    expect(TTS_KEY_ACCOUNTS).toEqual({
      aliyun: "tts:aliyun",
      mimo: "tts:mimo",
      siliconflow: "tts:siliconflow",
      local: "tts:local",
    });
  });

  it("keeps the built-in CET-6 agent aligned with the staged generator", () => {
    const instructions = DEFAULT_AGENTS[0]?.instructions ?? "";
    expect(instructions).toContain("exactly 13 paragraphs A-M");
    expect(instructions).toContain("A-M paragraph matching");
    expect(instructions).toContain("150-220 word English reference essay");
    expect(instructions).not.toContain("A-O paragraph matching");
  });
});
