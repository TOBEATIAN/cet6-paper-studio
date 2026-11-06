import { describe, expect, it } from "vitest";
import {
  classifyWritingOpening,
  chooseWritingOpeningPlan,
  createWritingOpeningPlan,
} from "../cet/writingPlan";

describe("writing opening plan", () => {
  it("keeps a paper stable and rotates across paper seeds", () => {
    const first = createWritingOpeningPlan("paper-a");
    expect(createWritingOpeningPlan("paper-a")).toEqual(first);
    expect(
      new Set(
        Array.from({ length: 12 }, (_, index) =>
          createWritingOpeningPlan(`paper-${index}`).style,
        ),
      ).size,
    ).toBeGreaterThan(1);
  });

  it("classifies each supported real-exam opening form", () => {
    expect(
      classifyWritingOpening(
        "Today there is a growing awareness that attention matters.",
      ),
    ).toBe("time");
    expect(
      classifyWritingOpening(
        "With the growth of artificial intelligence, judgement matters.",
      ),
    ).toBe("with");
    expect(
      classifyWritingOpening(
        "Faced with rapid change, students need independent judgement.",
      ),
    ).toBe("participle");
    expect(
      classifyWritingOpening(
        "It is widely believed that learning how to learn matters.",
      ),
    ).toBe("it-is");
    expect(
      classifyWritingOpening(
        "People are now increasingly aware of the value of sleep.",
      ),
    ).toBe("people");
    expect(
      classifyWritingOpening(
        "There is a growing awareness that mental health deserves attention.",
      ),
    ).toBe("there-is");
    expect(
      classifyWritingOpening(
        "In an era of rapid change, adaptability has become essential.",
      ),
    ).toBe("in-era");
    expect(
      classifyWritingOpening(
        "To succeed in a changing workplace, graduates need resilience.",
      ),
    ).toBe("to");
  });

  it("uses paper history to avoid adjacent repeats and overuse", () => {
    const previous = ["time", "with", "time", "participle"] as const;
    const plan = chooseWritingOpeningPlan("paper-history", previous);
    expect(plan.style).not.toBe("time");
    const second = chooseWritingOpeningPlan("another-paper", [
      plan.style,
      "time",
      "with",
      "time",
    ]);
    expect(second.style).not.toBe(plan.style);
    expect(
      [second.style, "time", "with", "time"].filter(
        (style) => style === second.style,
      ),
    ).toHaveLength(1);
  });
});
