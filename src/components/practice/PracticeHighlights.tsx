import { useEffect } from "react";
import {
  hashPracticeSource,
  usePracticeStore,
} from "../../stores/practiceStore";
import type { PracticeHighlight } from "../../stores/practiceStore";

const HIGHLIGHT_NAMES: Record<string, string> = {
  yellow: "cet6-hl-yellow",
  green: "cet6-hl-green",
  cyan: "cet6-hl-cyan",
  pink: "cet6-hl-pink",
  blue: "cet6-hl-blue",
  gray: "cet6-hl-gray",
};

/**
 * PDF-style annotations. Highlights live outside the Markdown source and are
 * projected onto visible text with the CSS Custom Highlight API.
 */
export function PracticeHighlights() {
  const practiceMode = usePracticeStore((state) => state.practiceMode);
  const highlights = usePracticeStore((state) => state.highlights);

  useEffect(() => {
    const registry = (
      CSS as unknown as {
        highlights?: {
          set: (name: string, highlight: unknown) => void;
          delete: (name: string) => void;
        };
      }
    ).highlights;
    const HighlightConstructor = (
      globalThis as unknown as {
        Highlight?: new () => {
          add: (range: Range) => void;
        };
      }
    ).Highlight;
    if (!registry || !HighlightConstructor) return;

    let frame = 0;
    const apply = () => {
      for (const name of Object.values(HIGHLIGHT_NAMES)) {
        registry.delete(name);
      }
      if (!practiceMode || highlights.length === 0) return;

      const sources = new Map<string, HTMLElement>();
      document
        .querySelectorAll<HTMLElement>("[data-markdown-source-key]")
        .forEach((element) => {
          if (element.closest("[aria-hidden='true']")) return;
          const key = element.dataset.markdownSourceKey;
          if (key) sources.set(key, element);
        });

      const grouped = new Map<string, InstanceType<typeof HighlightConstructor>>();
      for (const highlight of highlights) {
        const source = sources.get(highlight.sourceKey);
        if (!source) continue;
        if (
          highlight.sourceHash !==
          hashPracticeSource(source.dataset.markdownText ?? "")
        ) {
          continue;
        }
        const range = rangeForOffsets(source, highlight);
        if (!range) continue;
        const name = HIGHLIGHT_NAMES[highlight.color];
        if (!name) continue;
        let group = grouped.get(name);
        if (!group) {
          group = new HighlightConstructor();
          grouped.set(name, group);
        }
        group.add(range);
      }
      grouped.forEach((highlight, name) => registry.set(name, highlight));
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(apply);
    };

    const pages = document.querySelector(".paper-page-stack") ?? document.body;
    const observer = new MutationObserver(schedule);
    observer.observe(pages, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(frame);
      for (const name of Object.values(HIGHLIGHT_NAMES)) {
        registry.delete(name);
      }
    };
  }, [highlights, practiceMode]);

  return null;
}

function rangeForOffsets(
  source: HTMLElement,
  highlight: Pick<PracticeHighlight, "start" | "end">,
): Range | null {
  if (highlight.end <= highlight.start) return null;
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const next = offset + (text.nodeValue?.length ?? 0);
    if (!startNode && highlight.start >= offset && highlight.start <= next) {
      startNode = text;
      startOffset = highlight.start - offset;
    }
    if (highlight.end >= offset && highlight.end <= next) {
      endNode = text;
      endOffset = highlight.end - offset;
      break;
    }
    offset = next;
    node = walker.nextNode();
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}
