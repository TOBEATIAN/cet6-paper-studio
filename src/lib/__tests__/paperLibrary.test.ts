import { describe, expect, it } from "vitest";
import { ExamPaperSchema } from "../types/exam";
import { PaperIndexSchema } from "../types/library";
import {
  createPaperIndex,
  removePaperMeta,
  renamePaperMeta,
  upsertPaperMeta,
} from "../exam/paperLibrary";

const paper = ExamPaperSchema.parse({
  title: "Alpha",
  questions: [
    {
      id: "q1",
      type: "single-choice",
      content: "One",
      options: ["A", "B"],
      correctAnswer: 0,
      score: 1,
    },
  ],
});

describe("paper library helpers", () => {
  it("creates an index from an existing working paper", () => {
    const { index, paperId } = createPaperIndex(paper, "2026-01-01T00:00:00Z", "p1");

    expect(paperId).toBe("p1");
    expect(index.activePaperId).toBe("p1");
    expect(index.papers[0]).toMatchObject({
      id: "p1",
      title: "Alpha",
      questionCount: 1,
      kind: "full",
      archived: false,
    });
  });

  it("renames, updates and removes metadata while preserving fallback active paper", () => {
    let index = createPaperIndex(paper, "2026-01-01T00:00:00Z", "p1").index;
    index = upsertPaperMeta(
      index,
      "p2",
      { ...paper, title: "Beta", questions: [] },
      "2026-01-02T00:00:00Z",
    );
    index = renamePaperMeta(index, "p2", "Beta renamed", "2026-01-03T00:00:00Z");

    expect(index.papers[0].title).toBe("Beta renamed");

    index = removePaperMeta(index, "p2");
    expect(index.activePaperId).toBe("p1");
    expect(index.papers).toHaveLength(1);
  });

  it("migrates version-1 metadata defaults without losing the active paper", () => {
    const index = PaperIndexSchema.parse({
      version: 1,
      activePaperId: "old",
      papers: [
        {
          id: "old",
          title: "Old paper",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
          questionCount: 57,
        },
      ],
    });
    expect(index.activePaperId).toBe("old");
    expect(index.papers[0]).toMatchObject({
      kind: "full",
      archived: false,
      stageLabels: [],
    });
  });
});
