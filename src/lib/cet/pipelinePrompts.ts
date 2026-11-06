import type { ApiMessage } from "../types/library";
import type { Cet6Blueprint, Cet6ContentStage } from "../types/cet";
import { CET6_STAGE_SPECS, expectedQuestionCount } from "./structure";
import { createReadingBAnswerPlan } from "./readingBPlan";
import type { ReadingCPassagePlan } from "./readingCPlan";
import type { WritingOpeningStyle } from "./writingPlan";

const SYSTEM_PROMPT = `You are an experienced CET-6 assessment writer and editor.
Every item must be newly written for a non-official mock paper.
Never reproduce a real CET question, passage, listening transcript, answer key,
or widely published text. Never claim official affiliation.
Return exactly one \`\`\`json fenced block and no prose outside it.
Use valid JSON with double quotes and no comments.`;

const SHARED_RULES = `Quality requirements:
- Use natural, coherent English in a style suitable for Chinese university students.
- Keep topics linked by the supplied blueprint and avoid repeating a fact or example.
- Use plausible but clearly wrong distractors; do not make the longest option the answer by default.
- Vary correct-answer positions across A, B, C, and D.
- Every explanation must be written in Chinese. Quote the supporting English briefly,
  identify why the answer is right, share at least two content words with the correct
  option, and explain each wrong option separately. For Reading B,
  follow the stage-specific instruction to discuss only the two nearest distractor paragraphs.
- End every explanation with the exact Chinese form “故选 X。”.
- Listening and Reading C use exactly four options. Reading A and Reading B use
  the shared 15-item bank specified for that stage.
- correctAnswer is always the zero-based index into the options array.
- Do not write A/B/C/D labels inside question content or inside option strings.
- Do not include a paper title, preface, answer summary, or Markdown table around the JSON.`;

export function buildCet6BlueprintPrompt(): ApiMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Create a compact blueprint for one complete, original CET-6 mock paper.

Return this shape:
{"title":"...","topics":{"writing":"...","listening":"...","listeningCases":{"a1":"...","a2":"...","b1":"...","b2":"...","c1":"...","c2":"...","c3":"..."},"reading":"...","readingB":"...","readingC":{"first":"...","second":"..."},"translation":"..."}}

Constraints:
- writing: one argumentative or practical-writing task with a supplied opening sentence.
- listening: three linked themes covering campus life, science/technology, and society/culture.
- listeningCases: seven distinct concrete cases, one for each listening group. Use seven
  different people, institutions, settings and central examples; do not repeat the same
  service, product, study, policy or conflict across groups.
- reading: one accessible science or education theme, one work/society theme, and
  two distinct 430-450 word close-reading themes.
- readingB: one concrete work, education, science, or society subject for the
  13-paragraph Reading Section B matching passage. Do not include close-reading themes.
- readingC: two distinct 430-450 word close-reading subjects. Passage One and Passage
  Two must not share the same concrete example or argumentative frame.
- translation: one Chinese cultural, social, or technological topic suitable for 170-190 Chinese characters.
- Each topic field is a concise directive, not finished exam content.
- The four fields must not reuse the same concrete example.`,
    },
  ];
}

/**
 * Ask the model to repair its own previous structured response while preserving
 * every part that already passed the deterministic validators.
 */
export function buildCet6RepairMessage(
  previousReply: string,
  validationError: string,
): ApiMessage {
  return {
    role: "user",
    content: `Repair your previous JSON output instead of regenerating a new paper.

Validation failures to fix:
${validationError}

Previous JSON output:
${previousReply}

Rules:
- Preserve all content, options, answers, ordering, transcripts and explanations that already pass.
- Change only what is necessary to fix the listed failures.
- If the listed failures concern explanations only, do not change content,
  options, correctAnswer, paragraph assignments or answer ordering.
- If the listed failures concern overlap only, do not change explanations.
- Keep the exact same stage, structure and JSON shape.
- Recheck every returned question, especially per-question answer declarations and required fields.
- Return exactly one valid JSON object in a fenced block and no explanatory prose.`,
  };
}

export function buildCet6StagePrompt(
  stage: Cet6ContentStage,
  blueprint: Cet6Blueprint,
  validationError?: string,
  options: {
    readingBPassage?: string;
    readingBAnswerIndexes?: readonly number[];
    readingAAnswerIndexes?: readonly number[];
    listeningAnswerIndexes?: readonly number[];
    writingOpeningStyle?: WritingOpeningStyle;
  } = {},
): ApiMessage[] {
  const spec = CET6_STAGE_SPECS[stage];
  const count = expectedQuestionCount(stage);
  const groups = spec.groups
    .map((group) => {
      const nums = group.questionNumbers;
      return nums.length > 0
        ? `- ${group.id}: ${nums.length} questions, numbering ${nums[0]}-${nums[nums.length - 1]}`
        : `- ${group.id}: 1 task`;
    })
    .join("\n");

  const format =
    spec.questionType === "single-choice"
      ? singleChoiceFormat(
          stage,
          spec.kind,
          spec.scorePerQuestion,
          Boolean(options.readingBPassage),
        )
      : spec.questionType === "essay"
        ? `Return one essay question:
{"id":"unique","type":"essay","content":"For this part, you are allowed 30 minutes to write an essay that begins with the sentence “...” You can make comments, cite examples or use your personal experiences to develop your essay. You should write at least 150 words but no more than 200 words.","referenceAnswer":"150-220 word model essay that begins with the supplied sentence","writingGuidance":"中文写作思路（开头、主体、结尾、论据建议）","scoringCriteria":"中文评分标准","explanation":"中文审题与常见失分提醒","score":${spec.scorePerQuestion},"examSection":{"kind":"${spec.kind}","title":"${spec.labelEn}"}}`
        : `Return one Chinese-to-English translation task:
{"id":"unique","type":"short-answer","content":"170-190 Chinese characters","referenceAnswer":"complete model translation","scoringPoints":["中文评分要点"],"explanation":"中文翻译难点","score":${spec.scorePerQuestion},"examSection":{"kind":"${spec.kind}","title":"${spec.labelEn}","glossary":[{"zh":"中文难词","en":"English hint"}]}}`;

  const passageRule = spec.passageRequired
    ? stagePassageRule(stage, blueprint, options.readingBPassage)
    : "No shared passage is required for this stage.";
  const stageQualityRule =
    stage === "writing"
      ? `The directions must use “use your personal experiences”, set a 150-200 word
task, and contain an opening sentence of 16-25 words whose 8+ letter word
rate is 26%-66%. The opening must be a statement, must not contain whether, and
must not order an institution to take a concrete measure. Provide detailed Chinese
writing guidance, Chinese scoring criteria, and a 150-220 word English reference
essay in referenceAnswer. The reference essay must begin with the same supplied
sentence and develop the same claim. The review workflow will still improve a
user's own answer separately.
Use the mature Project_04 template exactly:
For this part, you are allowed 30 minutes to write an essay that begins with
the sentence “...” You can make comments, cite examples or use your personal
experiences to develop your essay. You should write at least 150 words but no
more than 200 words.
The supplied sentence must remain inline inside begins with the sentence and use
full-width Chinese double quotation marks. Do not add a Directions: prefix,
do not create a separate Opening sentence: label, and do not use ASCII
quotation marks such as "..." or escaped \\"...\\" around the opening sentence.
The overall writing prompt must not use a “write an essay on whether...” framework;
use “begins with the following sentence” and develop the supplied claim directly.
${writingOpeningInstruction(options.writingOpeningStyle)}`
      : stage === "translation"
        ? `Use a 170-190 Chinese-character original passage with 6-8 clauses and
provide a complete 100-180 word English reference translation plus Chinese translation notes.
Add 0-3 examSection.glossary entries for genuinely difficult Chinese terms; each
Chinese term must occur in the passage and the entries must not contain one another.
Include at least one four-character Chinese idiom or set phrase and at least one
subjectless clause or a clause containing two parallel actions. The style should read
like a real CET-6 cultural, social or technological passage rather than a list of facts.`
        : stage === "reading-a"
          ? readingAAnswerRule(options.readingAAnswerIndexes ?? [])
          : stage.startsWith("listening")
          ? `Keep options concise. Across this stage, the four-option average must be
between 6.5 and 9 words; each question's longest-minus-shortest spread must be at most 6 words.
The correct option must be the unique longest option in no more than 24% of questions.
At most 16% of stems may use the "What does X say about" frame. In at most 16% of
questions may a distractor share two or more content words with the correct option.
Use varied real-exam stems asking about purpose, reason, change, disadvantage, advice,
attitude or implication. Questions should average 10-12 words and use 8+ letter words
at roughly the real-paper rate; across the complete 25 questions, listening transcripts
must contain 15%-18.8% words of 8+ letters and stems at least 16%. Across the
complete 25 listening questions, the four answer
letters must end with counts whose maximum minus minimum is at most 1. The target
overall distribution is A6/B6/C6/D7, with no three consecutive identical answers.
${listeningAnswerRule(options.listeningAnswerIndexes ?? [])}`
        : stage === "reading-b"
          ? readingBStatementRule(
              options.readingBAnswerIndexes ??
                createReadingBAnswerPlan(blueprint.title).sourceIndexes,
            )
          : "";

  const correction = validationError
    ? `\nThe previous attempt failed validation. Fix every listed issue and regenerate:
${validationError}`
    : "";

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Generate only the ${spec.labelEn} stage for one CET-6 paper.

Blueprint:
${JSON.stringify(blueprint)}

Required structure:
- examSection.kind: ${spec.kind}
- question type: ${spec.questionType}
- exact question count: ${count}
- score per question: ${spec.scorePerQuestion}
- groups:
${groups}

${passageRule}

${stageQualityRule}

Output:
{"questions":[...]}

${format}

${SHARED_RULES}${stage.startsWith("listening") ? `

Listening explanation hard requirement:
- Every explanation must contain Chinese analysis, at least one short English phrase
  copied from that group's transcript inside quotation marks, and the exact final
  declaration “故选 X。”.
- X must match that question's correctAnswer. Check every question before returning.` : ""}${correction}`,
    },
  ];
}

/**
 * Reading B is generated in two calls. The passage is intentionally produced
 * first so a malformed 13-paragraph article does not force the model to spend
 * output budget on ten matching statements at the same time.
 */
export function buildCet6ReadingBPassagePrompt(
  blueprint: Cet6Blueprint,
  validationError?: string,
): ApiMessage[] {
  const correction = validationError
    ? `\nThe previous passage failed validation. Fix every listed issue and regenerate:
${validationError}`
    : "";
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Generate only the Reading Section B passage for one original CET-6 mock paper.

Reading B topic:
${readingBTopic(blueprint)}

Return exactly:
{"passage":"A. ...\\nB. ...\\n...\\nM. ..."}

Hard requirements:
- Exactly 13 paragraphs labelled A. through M. in order, with no unlabelled paragraph and no repeated letter.
- 1180-1230 English words total, measured only by English words in the passage field.
- A coherent work, education, science, or society article with a clear opening, development, examples, and conclusion.
- Include 9 direct quotations. Each quoted statement must contain at least 7 words.
- Attribute every direct quotation immediately in the same sentence with a reporting verb and a full name, for example: Dr. Elena Ward said, "..." or "...", argued Daniel Kim.
- Use at least one explicit opinion-attribution frame such as "According to Dr. Elena Ward, ...".
- Keep every quoted statement substantive and tied to the paragraph's claim.
- Do not include matching statements, question numbers, answers, explanations, Markdown headings, or prose outside the JSON object.${correction}`,
    },
  ];
}

export function buildCet6ReadingCPassagePrompt(
  passagePlan: ReadingCPassagePlan,
  validationError?: string,
): ApiMessage[] {
  const correction = validationError
    ? `\nThe previous passage failed validation. Fix every listed issue and regenerate:
${validationError}`
    : "";
  const wordPattern = passagePlan.targetParagraphWords
    .map((words, index) => `Paragraph ${index + 1}: about ${words} words`)
    .join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Generate only Passage ${passagePlan.index + 1} of Reading Section C for one original CET-6 mock paper.

Topic:
${passagePlan.source.topic}

Return exactly:
{"passage":"paragraph one\\nparagraph two\\n..."}

Hard passage requirements:
- Exactly ${passagePlan.paragraphCount} natural paragraphs and 430-450 English words total.
- Follow this paragraph-length rhythm as closely as possible:
${wordPattern}
- At least two paragraphs are 35 words or shorter.
- The final paragraph must be one unbroken paragraph of at least 100 words.
- The total target is 450 English words. Do not stop at 430; use 435-448 as the narrow acceptance target.
- Include one sentence of 55-65 words. Include exactly 5 sentences of 12 words or fewer.
- Use sophisticated but natural academic English: 25%-26% of words must have at least 8 letters.
- Include at least 12 locatable specifics, including at least two Arabic numbers, percentages, years or monetary figures.
- Include at least one curly-quoted direct quotation and attribute it to a full person name in the same sentence.
- Include a named researcher, expert, official or institution that can support a later opinion question.
- Use a clear argumentative or explanatory structure, not a list of disconnected facts.
- Do not include questions, options, answers, explanations, source metadata, headings or prose outside the JSON object.${correction}`,
    },
  ];
}

export function buildCet6ReadingCQuestionsPrompt(
  blueprint: Cet6Blueprint,
  passagePlan: ReadingCPassagePlan,
  passage: string,
  validationError?: string,
): ApiMessage[] {
  const firstNumber = passagePlan.index === 0 ? 46 : 51;
  const answerMap = passagePlan.answerIndexes
    .map(
      (index, offset) =>
        `Q${firstNumber + offset}=${String.fromCharCode(65 + index)}`,
    )
    .join(", ");
  const paragraphMap = passagePlan.sourceParagraphs
    .map(
      (paragraph, offset) =>
        `Q${firstNumber + offset}=paragraph ${paragraph}`,
    )
    .join(", ");
  const kindMap = passagePlan.questionKinds
    .map(
      (kind, offset) =>
        `Q${firstNumber + offset}=${kind}`,
    )
    .join(", ");
  const namedOpinion = passagePlan.questionKinds.includes("attitude")
    ? firstNumber +
      passagePlan.questionKinds.findIndex((kind) => kind === "attitude")
    : null;
  const correction = validationError
    ? `\nThe previous questions failed validation. Fix every listed issue and regenerate:
${validationError}`
    : "";
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Generate only the five Reading Section C questions for the fixed passage below.

Blueprint:
${JSON.stringify(blueprint)}

Passage:
${passage}

Question plan:
- Question numbers: ${firstNumber}-${firstNumber + 4}
- Fixed question kinds: ${kindMap}
- Fixed correct answer positions: ${answerMap}
- Fixed evidence paragraph positions: ${paragraphMap}
- Use exactly four text options for every question and set correctAnswer to the fixed index.
- All four options must contain at least three words; longest-minus-shortest per question must be at most six words.
- In every question, at least one distractor must be no shorter than the correct option.
- The four-option average across this set of five questions must be at most ten words.
- Across the ten Reading C questions, at least four questions must have a four-option
  average of 9-10 words, matching the real-paper long-option mix.
- The correct option may be the unique longest option in no more than two of these five questions.
- Question stems should average at least twelve words and should point to a concrete person, object, study, policy or effect.
- Each question must be answered primarily from its fixed paragraph; adjacent
  paragraphs may support it only when the item genuinely integrates them. Paragraph
  positions must therefore remain in reading order.
- The correct option must be a cross-sentence paraphrase. Its longest identical word
  sequence must be at most three words; no more than two of the ten questions may use
  a three-word sequence.
- At least two distractors in each question should quote or paraphrase a locatable
  detail from the target paragraph or an adjacent paragraph, while still being wrong.
- Correct options across the ten Reading C questions should average no more than 40% content-word overlap with their strongest supporting sentence.
- Build the correct option with synonyms and facts combined across at least two clauses or sentences.
- Include plausible distractors using these types: 张冠李戴, 程度偏移, 无中生有, 答非所问, 因果倒置, 与原文相悖, 半对半错, 偷换范围.
- Every explanation must be Chinese, include one short supporting English phrase in curly quotes, explicitly discuss each of A), B), C), D) and its error type, and end with “故选 X。” matching the fixed answer.
- Do not include examSection.passage, examSection.source, examSection.para or examSection.questionKind; the application inserts them.
${namedOpinion ? `- Q${namedOpinion} is the attitude question and must begin: "What does [a full person name] think of ...". Do not ask only about "the author".` : ""}

Return exactly:
{"questions":[{"id":"...","type":"single-choice","content":"...","options":["...","...","...","..."],"correctAnswer":0,"explanation":"...","score":14.2,"examSection":{"kind":"cet-reading-c","groupId":"passage-${passagePlan.index + 1}","title":"Reading Section C · Passage ${passagePlan.index + 1}","questionNumber":${firstNumber}}}]}${correction}`,
    },
  ];
}

function singleChoiceFormat(
  stage: Cet6ContentStage,
  kind: string,
  score: number,
  omitReadingBPassage = false,
): string {
  const common = `{"id":"unique","type":"single-choice","content":"stem","options":OPTIONS,"correctAnswer":0,"explanation":"中文解析……故选 A。","score":${score},"examSection":{"kind":"${kind}","groupId":"group-id","title":"组标题","questionNumber":1,PASSAGE_FIELD}}`;
  if (stage === "reading-a") {
    return `Use one shared 15-word bank. Every question repeats that same 15-item options
array, and the first question also writes it to examSection.optionBank together with
examSection.bankPos (15 values from n/v/adj/adv). Set hideOptions=true.
Example:
{"id":"unique","type":"single-choice","content":"sentence containing ___","options":["wordA",...,"wordO"],"correctAnswer":0,"explanation":"中文解析，逐项说明 A)… B)… C)… D)…，故选 A。","score":${score},"examSection":{"kind":"${kind}","groupId":"banked-cloze","title":"Reading Section A","questionNumber":26,"passage":"260-300-word passage","optionBank":["wordA",...,"wordO"],"bankPos":["n",...,"adv"],"hideOptions":true}}`;
  }
  if (stage === "reading-b") {
    const passageField = omitReadingBPassage
      ? ""
      : `,"passage":"1180-1230 words with 13 labelled paragraphs A-M"`;
    return `Each question is one matching statement. Use the shared 13-item paragraph-letter
option bank ["A","B",...,"M"] as options and examSection.optionBank on the first item;
set hideOptions=true. correctAnswer is the zero-based paragraph index.
Example:
{"id":"unique","type":"single-choice","content":"statement to match","options":["A","B",...,"M"],"correctAnswer":1,"explanation":"中文解析，说明定位依据并排除高频干扰段，故选 B。","score":${score},"examSection":{"kind":"${kind}","groupId":"matching","title":"Reading Section B","questionNumber":36${passageField},"optionBank":["A","B",...,"M"],"hideOptions":true}}`;
  }
  if (stage === "reading-c") {
    return `Each question has four text options. Add questionKind (detail/inference/attitude)
and, on the first question of each passage group, add source
{"outlet":"原创编辑部","type":"评论|研究报告|科普|商业|法律医学","topic":"..."}.
Put the complete passage only on the first question of each passage group; the
other four questions in that group must omit examSection.passage entirely.
The explanation must mention A), B), C), D), explain each wrong option, use at least
one wrong-answer type such as 张冠李戴/程度偏移/无中生有/答非所问/因果倒置/与原文相悖, and end with 故选 X。
${common}`;
  }
  return `Each listening question has four text options. The explanation must be Chinese,
include one short English supporting quote, discuss all three distractors, and end
with 故选 X。
${common}`;
}

function stagePassageRule(
  stage: Cet6ContentStage,
  blueprint: Cet6Blueprint,
  readingBPassage?: string,
): string {
  if (stage === "listening-a") {
    return `${listeningCaseRule(blueprint, "listening-a")}
Put two complete conversation transcripts in two distinct groupIds, one per
conversation. Each transcript is 360-400 English words, identifies speakers as
Woman:/Man:, and is placed in examSection.passage on the first question of its group.
Keep each conversation within the mature 360-400 word window.
Use listening-only option design: question stems average 10-12 words and at most one
of eight stems may use “What does the X say about”.`;
  }
  if (stage === "listening-b") {
    return `${listeningCaseRule(blueprint, "listening-b")}
Put two complete listening-passage transcripts in two distinct groupIds.
Each transcript is 310-365 English words and is placed in examSection.passage on the
first question of its group. Do not summarize the recording.`;
  }
  if (stage === "listening-c") {
    return `${listeningCaseRule(blueprint, "listening-c")}
Put three complete lecture/talk transcripts in three distinct groupIds. Each
is 400-500 words and their total is 1300-1450 words. Place each transcript in
examSection.passage on the first question of its group.`;
  }
  if (stage === "reading-a") {
    return `The passage is 260-300 words and contains blanks numbered 26-35 in reading
order. Mark every blank with underscores around its number, for example ____26____.
Also provide a 15-word bank A-O, 10 of which are at least 8 letters long and
whose mean length is at least 8.5 letters. The bank and word-class labels must appear
on the first question.`;
  }
  if (stage === "reading-b") {
    if (readingBPassage) {
      return `Use this fixed passage as the sole source. Do not rewrite it and do not include
examSection.passage in the JSON; the application inserts this exact passage after parsing.
Every statement must be answerable from this passage:

${readingBPassage}`;
    }
    return `Write one 1180-1230 word passage with exactly 13 labelled paragraphs A-M.
Include nine directly quoted statements of at least seven words each, with every quote
immediately attributed to a full name. At least four paragraphs must remain unmatched
distractors.`;
  }
  if (stage === "reading-c") {
    return `Write two different passages of 430-450 words each, with 6-12 paragraphs
and different paragraph counts. Each passage should have paragraph-length sigma
26-28.6, at least two paragraphs no longer than 35 words, at least one paragraph at
least 90 words, a 42-87 word longest sentence, 4-10 sentences no longer than 12 words,
20%-27.6% words of 8+ letters, and 8-42 locatable specific facts including Arabic
numerals. Include at least one quotation in the pair and at least one named person or
institution in an opinion question.`;
  }
  return "No shared passage is required for this stage.";
}

function listeningCaseRule(
  blueprint: Cet6Blueprint,
  stage: "listening-a" | "listening-b" | "listening-c",
): string {
  const cases = blueprint.topics.listeningCases;
  if (!cases) {
    return `Use distinct concrete cases for every group. Do not reuse the same institution,
service, product, rules, dates, or central example across groups.`;
  }
  const keys =
    stage === "listening-a"
      ? (["a1", "a2"] as const)
      : stage === "listening-b"
        ? (["b1", "b2"] as const)
        : (["c1", "c2", "c3"] as const);
  return `${keys
    .map((key) => `${key.toUpperCase()}: ${cases[key]}`)
    .join("\n")}
Keep these seven blueprint cases mutually distinct. Do not borrow another group's
institution, service, product, rules, dates, or central example.`;
}

function readingBStatementRule(answerIndexes: readonly number[]): string {
  const answerMap = answerIndexes.map(
    (index, questionIndex) =>
      `Q${36 + questionIndex}=${String.fromCharCode(65 + index)}(correctAnswer ${index})`,
  ).join(", ");
  return `The ten correct answer positions are fixed by the application:
${answerMap}
Every question must use options ["A","B","C","D","E","F","G","H","I","J","K","L","M"]
and every correctAnswer must exactly match this map. Do not reorder the questions.
This intermediate order follows the paragraph sequence. After all ten statements are
validated, the application will shuffle the complete questions into their final exam order.
Use ten different paragraphs: do not assign the same paragraph twice.
Question 39 must begin with "According to [a full person name]," and must contain an
explicit opinion-attribution frame. Each statement must closely match only its assigned
paragraph while using synonyms and rephrasing. Never copy a phrase longer than three
words. Match the mature template: each statement must be 9-20 English words, with a
median of 12-16 words and preferably one clear relation per statement. Do not concatenate
two clauses merely to include every detail from the paragraph. Keep the content-word
overlap high enough to remain uniquely locatable: across
all statements, the median overlap with the closest paragraph must stay between 40%
and 45%, and the highest overlap must stay at or below 69%. When repairing the
statement set, use the per-question overlap measurements in the validation error:
for any statement above 45%, replace enough repeated content words with natural
synonyms to bring it into range; for any statement below 40%, retain one more
specific noun or verb from its target paragraph. Do not copy a longer phrase.
Do not make the statement a paragraph heading, a sentence copied from the passage, or a
generic topic sentence. Each explanation must be Chinese, quote a short English locating
phrase, briefly distinguish the two nearest distractor paragraphs, and end with the exact
form “故选 X。”. It is not necessary to discuss all fourteen distractor letters.`;
}

function readingAAnswerRule(answerIndexes: readonly number[]): string {
  if (answerIndexes.length !== 10) return "";
  const answerMap = answerIndexes
    .map(
      (index, offset) =>
        `Q${26 + offset}=${String.fromCharCode(65 + index)}(correctAnswer ${index})`,
    )
    .join(", ");
  return `The ten correct bank positions are fixed by the application:
${answerMap}
Every question repeats the same 15-item options array and must use its assigned
correctAnswer exactly. The answer sequence is intentionally non-monotonic.
Explain the correct word's meaning and usage, plus at most two closest competing
bank words; it is not necessary to discuss all fourteen distractors.`;
}

function listeningAnswerRule(answerIndexes: readonly number[]): string {
  if (answerIndexes.length === 0) return "";
  const firstNumber =
    answerIndexes.length === 8 ? 1 : answerIndexes.length === 7 ? 9 : 16;
  const answerMap = answerIndexes
    .map(
      (index, offset) =>
        `Q${firstNumber + offset}=${String.fromCharCode(65 + index)}(correctAnswer ${index})`,
    )
    .join(", ");
  return `The correct answer positions are fixed by the application:
${answerMap}
Every explanation must describe the option at the assigned correctAnswer as correct,
and the final “故选 X。” must use that same letter. Do not reorder the questions.`;
}

function readingBTopic(blueprint: Cet6Blueprint): string {
  return (
    blueprint.topics.readingB ??
    `${blueprint.topics.reading}. Use the work/society component for the 13-paragraph matching passage and ignore the close-reading components.`
  );
}

function writingOpeningInstruction(
  style: WritingOpeningStyle | undefined,
): string {
  if (style === "time") {
    return "For this paper, the supplied opening sentence must begin with Nowadays, Today, or In recent years.";
  }
  if (style === "with") {
    return "For this paper, the supplied opening sentence must begin with a natural With + noun-phrase construction.";
  }
  if (style === "participle") {
    return "For this paper, the supplied opening sentence must begin with Faced with..., Living in..., or a natural participial phrase.";
  }
  if (style === "it-is") {
    return "For this paper, the supplied opening sentence must begin with It is widely accepted/believed that...";
  }
  if (style === "people") {
    return "For this paper, the supplied opening sentence must begin with People are now increasingly aware...";
  }
  if (style === "there-is") {
    return "For this paper, the supplied opening sentence must begin with There is a growing awareness...";
  }
  if (style === "in-era") {
    return "For this paper, the supplied opening sentence must begin with In an era of..., followed by a need or value judgment.";
  }
  if (style === "to") {
    return "For this paper, the supplied opening sentence must begin with a To + infinitive purpose phrase.";
  }
  return "";
}
