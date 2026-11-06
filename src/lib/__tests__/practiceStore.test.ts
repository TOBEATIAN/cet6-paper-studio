import { beforeEach, describe, expect, it } from "vitest";
import {
  hashPracticeSource,
  usePracticeStore,
} from "../../stores/practiceStore";

describe("practice store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePracticeStore.getState().load(null);
  });

  it("keeps independent answer sessions for different papers", () => {
    const store = usePracticeStore.getState();
    store.load("paper-a");
    store.setAnswer("q1", "C");
    store.setWritingAnswer("Essay A");
    store.setTranslationAnswer("译文 A");
    store.setNote("word-bank:bank:0", "n. 名词");

    store.load("paper-b");
    expect(usePracticeStore.getState().answers).toEqual({});
    expect(usePracticeStore.getState().notes).toEqual({});

    usePracticeStore.getState().load("paper-a");
    expect(usePracticeStore.getState()).toMatchObject({
      answers: { q1: "C" },
      writingAnswer: "Essay A",
      translationAnswer: "译文 A",
      notes: { "word-bank:bank:0": "n. 名词" },
      submitted: false,
    });
  });

  it("marks submission and resets when answers are cleared", () => {
    usePracticeStore.getState().load("paper-a");
    usePracticeStore.getState().setAnswer("q1", "B");
    usePracticeStore.getState().submit();
    expect(usePracticeStore.getState().submitted).toBe(true);

    usePracticeStore.getState().clearAnswers();
    expect(usePracticeStore.getState()).toMatchObject({
      answers: {},
      writingAnswer: "",
      translationAnswer: "",
      notes: {},
      submitted: false,
    });
  });

  it("keeps the submitted state when an answer is corrected after submission", () => {
    usePracticeStore.getState().load("paper-submitted");
    usePracticeStore.getState().setAnswer("q1", "B");
    usePracticeStore.getState().submit();

    usePracticeStore.getState().setAnswer("q1", "C");

    expect(usePracticeStore.getState()).toMatchObject({
      answers: { q1: "C" },
      submitted: true,
    });
  });

  it("keeps notes when answers are cleared and resets interaction mode outside practice", () => {
    const store = usePracticeStore.getState();
    store.load("paper-a");
    store.setNote("option:q1:0", "adj. 形容词");
    store.setPracticeMode(true);
    store.setInteractionMode("highlight");
    store.setHighlightColor("pink");
    store.setAnswer("q1", "B");

    store.clearAnswers();
    expect(usePracticeStore.getState().notes).toEqual({
      "option:q1:0": "adj. 形容词",
    });
    expect(usePracticeStore.getState().interactionMode).toBe("highlight");
    expect(usePracticeStore.getState().highlightColor).toBe("pink");

    store.setPracticeMode(false);
    expect(usePracticeStore.getState().interactionMode).toBe("answer");
  });

  it("persists PDF-style highlights and removes intersecting ranges", () => {
    const store = usePracticeStore.getState();
    store.load("paper-highlights");
    store.addHighlight({
      id: "h1",
      questionId: "q1",
      source: "content",
      sourceKey: "content:q1",
      sourceHash: hashPracticeSource("content"),
      start: 2,
      end: 12,
      color: "yellow",
    });
    store.addHighlight({
      id: "h2",
      questionId: "q1",
      source: "content",
      sourceKey: "content:q1",
      sourceHash: hashPracticeSource("content"),
      start: 20,
      end: 30,
      color: "green",
    });
    store.addHighlight({
      id: "h3",
      questionId: "q1",
      source: "content",
      sourceKey: "content:q1",
      sourceHash: hashPracticeSource("content"),
      start: 40,
      end: 50,
      color: "pink",
    });

    store.load("paper-highlights");
    expect(usePracticeStore.getState().highlights).toHaveLength(3);

    store.removeHighlightsInRange("content:q1", 8, 24);
    expect(usePracticeStore.getState().highlights).toEqual([
      expect.objectContaining({ id: "h3", start: 40, end: 50 }),
    ]);
  });
});
