import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PracticeHighlights } from "../../components/practice/PracticeHighlights";
import {
  hashPracticeSource,
  usePracticeStore,
} from "../../stores/practiceStore";

describe("PracticeHighlights", () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePracticeStore.getState().load(null);
  });

  it("projects stored ranges onto matching visible text without changing content", async () => {
    const ranges: Range[] = [];
    class FakeHighlight {
      add(range: Range) {
        ranges.push(range);
      }
    }
    const registry = {
      set: vi.fn(),
      delete: vi.fn(),
    };
    Object.defineProperty(globalThis, "Highlight", {
      configurable: true,
      value: FakeHighlight,
    });
    Object.defineProperty(CSS, "highlights", {
      configurable: true,
      value: registry,
    });
    usePracticeStore.getState().load("highlight-overlay");
    usePracticeStore.getState().setPracticeMode(true);
    usePracticeStore.getState().addHighlight({
      id: "h1",
      questionId: "q1",
      source: "content",
      sourceKey: "content:q1",
      sourceHash: hashPracticeSource("Highlighted text"),
      start: 0,
      end: 11,
      color: "yellow",
    });
    usePracticeStore.getState().addHighlight({
      id: "stale",
      questionId: "q1",
      source: "content",
      sourceKey: "content:q1",
      sourceHash: "deadbeef",
      start: 12,
      end: 16,
      color: "green",
    });

    const { container } = render(
      <>
        <PracticeHighlights />
        <div
          data-markdown-source-key="content:q1"
          data-markdown-text="Highlighted text"
        >
          Highlighted text
        </div>
      </>,
    );

    await waitFor(() => expect(ranges).toHaveLength(1));
    expect(ranges[0].toString()).toBe("Highlighted");
    expect(container.textContent).toBe("Highlighted text");
    expect(registry.set).toHaveBeenCalledWith(
      "cet6-hl-yellow",
      expect.any(FakeHighlight),
    );
  });
});
