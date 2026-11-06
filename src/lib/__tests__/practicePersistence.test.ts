import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configurePracticePersistence,
  hashPracticeSource,
  usePracticeStore,
} from "../../stores/practiceStore";

const mocks = vi.hoisted(() => ({
  loadPracticeSession: vi.fn(),
  savePracticeSession: vi.fn(),
}));

vi.mock("../storage/tauri", () => ({
  loadPracticeSession: mocks.loadPracticeSession,
  savePracticeSession: mocks.savePracticeSession,
}));

describe("practice session persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    usePracticeStore.getState().load(null);
    configurePracticePersistence("E:\\CET-6");
    mocks.savePracticeSession.mockResolvedValue(undefined);
  });

  it("writes answers and annotations to the selected data directory", async () => {
    usePracticeStore.getState().load("paper-persist");
    usePracticeStore.getState().setAnswer("q1", "B");
    usePracticeStore.getState().addHighlight({
      id: "h1",
      questionId: "q1",
      source: "content",
      sourceKey: "content:q1",
      sourceHash: hashPracticeSource("Question text"),
      start: 0,
      end: 8,
      color: "yellow",
    });

    await vi.waitFor(() =>
      expect(mocks.savePracticeSession).toHaveBeenCalledWith(
        "E:\\CET-6",
        "paper-persist",
        expect.objectContaining({
          answers: { q1: "B" },
          highlights: [
            expect.objectContaining({
              sourceHash: hashPracticeSource("Question text"),
            }),
          ],
        }),
      ),
    );
  });

  it("hydrates the newer file copy instead of stale localStorage data", async () => {
    window.localStorage.setItem(
      "cet6-practice-sessions-v1",
      JSON.stringify({
        "paper-hydrate": {
          answers: { q1: "A" },
          writingAnswer: "",
          translationAnswer: "",
          notes: {},
          highlights: [],
          submitted: false,
          updatedAt: "2026-11-01T00:00:00.000Z",
        },
      }),
    );
    mocks.loadPracticeSession.mockResolvedValue({
      answers: { q1: "D" },
      writingAnswer: "Essay",
      translationAnswer: "译文",
      notes: { "question:q1": "review" },
      highlights: [
        {
          id: "h1",
          questionId: "q1",
          source: "content",
          sourceKey: "content:q1",
          sourceHash: hashPracticeSource("Question text"),
          start: 0,
          end: 8,
          color: "pink",
        },
      ],
      submitted: true,
      updatedAt: "2026-11-02T00:00:00.000Z",
    });

    usePracticeStore.getState().load("paper-hydrate");
    await usePracticeStore.getState().hydrate("paper-hydrate");

    expect(usePracticeStore.getState()).toMatchObject({
      answers: { q1: "D" },
      notes: { "question:q1": "review" },
      submitted: true,
    });
    expect(usePracticeStore.getState().highlights).toHaveLength(1);
  });
});
