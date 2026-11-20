import { describe, expect, it } from "vitest";
import {
  applyProvidedAnswers,
  isAnswerKeyPage,
  parseProvidedAnswers,
} from "../import/answerKey";
import { AnswerBankEntrySchema } from "../types/answerBank";
import {
  AnswerSearchRowSchema,
  ImportedPaperDraftSchema,
} from "../types/import";

const answerPage = `2025年6学英语六级考试真题答案速查
第一套
PartIⅡIListening Comprehension
1.C
2.B
3.D
6.D
7.C
8.D
9.C
10.B
4.A
5.A
17.A
11.A
12.C
13.C
14.B
15.B
16.D
19.A
20.D
18.B
21.C
25.B
22.D
23.A
24.D
Part IⅢI Reading Comprehension
27.B
28.L
32.C
26.J
29.F
30.A
31.D
33.E
34.G
35.0
37.C
42.F
44.B
45.K
36.G
38.1
39.D
40.A
41.L
43.H
46.C
47.A
54.C
48.B
49.B
50.C
51.D
52.A
53.D
55.B
第二套
Part II Listening Comprehension
6.c
7.A
8.B
1.D
2.B
3.A
4.D
5.B
9.D
10.C
11.B
12.A
13.C
14.A
15.D
16.C
17.A
18.D
19.A
20.D
22.C
25.C
21.B
23.D
24.B
PartIⅢReadingComprehension
27.E
29.A
28.F
31.D
32.C
33.G
34.L
35.N
26.B
30.1
36.C
37.H
41.E
42.0
44.G
45.N
38.B
39.1
40.M
43.L
46.C
51.A
52.C
53.B
54.D
55.B
47.A
48.A
49.D
50.B
第三套
Part IⅢ Reading Comprehension
26.K
27.B
31.C
32.D
34.0
28.1
29.A
30.J
33.F
35.E
36.E
37.K
38.H
39.A
42.D
43.L
44.C
40.1
45.J
41.M
46.A
54.D
47.C
48.D
49.A
50.B
51.B
52.B
53.C
55.B`;

describe("embedded answer keys", () => {
  it("detects and parses all three sets, including A-O Reading answers", () => {
    expect(isAnswerKeyPage(answerPage)).toBe(true);
    const answers = parseProvidedAnswers([
      { pageNumber: 23, text: answerPage },
    ]);
    expect(answers).toHaveLength(140);
    expect(answers).toContainEqual({
      setLabel: "第一套",
      stage: "reading-a",
      sourceQuestionNumber: 28,
      answerLetter: "L",
    });
    expect(answers).toContainEqual({
      setLabel: "第三套",
      stage: "reading-c",
      sourceQuestionNumber: 55,
      answerLetter: "B",
    });
    expect(
      answers.some(
        (answer) =>
          answer.setLabel === "第三套" &&
          answer.sourceQuestionNumber <= 25,
      ),
    ).toBe(false);
  });

  it("applies provided answers to matching set questions only", () => {
    const draft = ImportedPaperDraftSchema.parse({
      mode: "full",
      setLabel: "第一套",
      blocks: [
        {
          groupId: "reading-a",
          stage: "reading-a",
          questions: [
            {
              sourceQuestionNumber: 26,
              content: "Question",
              options: Array.from({ length: 15 }, (_, index) =>
                String.fromCharCode(65 + index),
              ),
            },
          ],
        },
      ],
    });
    const answers = parseProvidedAnswers([
      { pageNumber: 23, text: answerPage },
    ]);
    expect(
      applyProvidedAnswers(draft, answers).blocks[0].questions[0]
        .answerLetter,
    ).toBe("J");
  });

  it("allows A-O letters in answer rows and bank entries", () => {
    expect(
      AnswerSearchRowSchema.parse({
        stage: "reading-a",
        groupId: "reading-a",
        sourceQuestionNumber: 28,
        answerLetter: "L",
        status: "provided",
      }).answerLetter,
    ).toBe("L");
    expect(
      AnswerBankEntrySchema.parse({
        id: "entry",
        examDate: "2025-06",
        setLabel: "第一套",
        stage: "reading-a",
        groupId: "reading-a",
        sourceQuestionNumber: 28,
        answerLetter: "L",
        status: "provided",
        confirmedAt: "2026-11-20T00:00:00.000Z",
      }).answerLetter,
    ).toBe("L");
  });

  it("normalizes common OCR confusions in banked-cloze answers", () => {
    const answers = parseProvidedAnswers([
      {
        pageNumber: 23,
        text: `2025年6月六级答案速查
第一套
Listening Comprehension
1.c 2.b 3.d 4.a 5.a 6.d 7.c 8.d 9.c 10.b
Reading Comprehension
26.j 27.b 28.l 29.f 30.a 31.d 32.c 33.e 34.g 35.0
36.g 37.c 38.1 39.d 40.a 41.l 42.f 43.h 44.b 45.k
46.c 47.a 48.b 49.b 50.c 51.d 52.a 53.d 54.c 55.b`,
      },
    ]);
    expect(
      answers.find(
        (answer) =>
          answer.stage === "reading-a" &&
          answer.sourceQuestionNumber === 35,
      )?.answerLetter,
    ).toBe("O");
    expect(
      answers.find(
        (answer) =>
          answer.stage === "reading-b" &&
          answer.sourceQuestionNumber === 38,
      )?.answerLetter,
    ).toBe("I");
  });
});
