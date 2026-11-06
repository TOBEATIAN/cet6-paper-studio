import { describe, expect, it } from "vitest";
import {
  normalizeSpeechText,
  prepareSpeechForTts,
  splitSpeechSentences,
} from "../tts/text";

describe("TTS text preparation", () => {
  it("keeps common abbreviations and decimals inside a sentence", () => {
    expect(
      splitSpeechSentences(
        "Dr. Smith moved to the U.S. in 2.5 years. He now lives in New York.",
      ),
    ).toEqual([
      "Dr. Smith moved to the U.S. in 2.5 years.",
      "He now lives in New York.",
    ]);
  });

  it("keeps dates, times, initials, and numbered labels inside one sentence", () => {
    expect(
      splitSpeechSentences(
        'At 9:30 p.m. on Jan. 3, Dr. Lee met J. K. Rowling in Apt. 12. No. 7 was closed.',
      ),
    ).toEqual([
      "At 9:30 p.m. on Jan. 3, Dr. Lee met J. K. Rowling in Apt. 12.",
      "No. 7 was closed.",
    ]);
  });

  it("does not treat a degree abbreviation as the end of a sentence", () => {
    expect(
      splitSpeechSentences(
        "She earned a Ph.D. in economics. She now teaches at the university.",
      ),
    ).toEqual([
      "She earned a Ph.D. in economics.",
      "She now teaches at the university.",
    ]);
  });

  it("treats a standalone no as a sentence ending, not a numbered label", () => {
    expect(splitSpeechSentences("The answer is No. Then he left.")).toEqual([
      "The answer is No.",
      "Then he left.",
    ]);
    expect(prepareSpeechForTts("The answer is No. Then he left.")).toBe(
      "The answer is No. Then he left.",
    );
  });

  it("splits dialogue after a closing quote", () => {
    expect(
      splitSpeechSentences('"Are you ready?" she asked. "Yes," he replied.'),
    ).toEqual([
      '"Are you ready?" she asked.',
      '"Yes," he replied.',
    ]);
  });

  it("expands written abbreviations for speech without changing the source", () => {
    expect(
      prepareSpeechForTts(
        "At 9:30 p.m., Dr. Lee met Mrs. Smith in Apt. 4, e.g. near No. 7.",
      ),
    ).toBe(
      "At 9:30 PM, Doctor Lee met Missus Smith in Apartment 4, for example near Number 7.",
    );
  });

  it("normalizes spacing without changing sentence punctuation", () => {
    expect(normalizeSpeechText("Hello ,world!\n\nHow are you ?")).toBe(
      "Hello, world! How are you?",
    );
    expect(normalizeSpeechText("The train leaves at 10:30.")).toBe(
      "The train leaves at 10:30.",
    );
  });

  it("splits an oversized sentence at safe boundaries", () => {
    const result = splitSpeechSentences(
      "This is a deliberately long clause with enough words to require splitting, and it continues with another clause that also needs room in the output.",
      60,
    );
    expect(result.length).toBeGreaterThan(1);
    expect(result.every((part) => part.length <= 60)).toBe(true);
  });

  it("rejects an unusably small request limit", () => {
    expect(() => splitSpeechSentences("test", 20)).toThrow();
  });
});
