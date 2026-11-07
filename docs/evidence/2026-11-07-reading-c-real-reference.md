# 2026-11-07 Reading C real-paper reference and risk closure

## Decision

Reading Section C now uses two separate reference sources:

1. **Primary calibration:** real CET-6 papers from 2022 onward. Only aggregate
   statistics are included in the app: article length, paragraph variability,
   sentence variety, long-word rate, locatable detail count, option shape, and
   correct-option/support overlap. No real passage, question, option, answer, or
   explanation is bundled or sent to the model.
2. **Secondary continuity check:** the four most recent generated papers in the
   local paper library. Only Reading C question-kind counts, source types, and
   paragraph counts are read. Their text is not sent to the model.

The source corpus is under:

`E:\WorkSpace\Project_04_专门学习\Project_02_六级\六级资料\英语六级备考资料包`

Relevant local calibration evidence:

- `Project_02_六级\模拟卷\calibration\real_2026_06_sectionC.json`
- `Project_02_六级\模拟卷\calibration\real_2026_06_answers.json`
- `Project_02_六级\模拟卷\命题规范.md` appendices A-5, A-7, A-8
- `Project_02_六级\模拟卷\操作手册.md` section 3.5

Papers before 2022 are intentionally excluded.
For the current profile table, extractable samples come from the 2022.06 sets,
2022.09, the 2022.12–2025.12 corpus, and the 2026.06 three sets. The 2022.06
third set duplicates the second set's reading content and is not counted twice.

## Generation changes

- Reading C rotates across four validated paragraph skeletons: 7+9, 7+10,
  8+9, and 8+10 paragraphs. These remain inside the established 6–12 paragraph
  rule and use target word patterns whose paragraph sigma is 26–28.6.
- The ten-question kind pattern rotates away from the most recently generated
  paper while staying inside detail 6–8, inference 1–3, attitude 0–1.
- Source-type selection minimizes repetition across the current paper plus up
  to four recent generated papers, enforcing the old five-paper limit of at
  most two uses per type whenever the available combinations allow it.
- The question prompt now defines a valid distractor anchor as a specific detail
  with one changed dimension: actor, object, time, cause, degree, or scope. This
  prevents the old conflict where the prompt encouraged distractors to copy more
  source wording than the correct option.

## Risk closure

The Project_04 warning thresholds remain semantic warnings:

- same strongest sentence and distractor overlap >= 60%;
- strongest distractor overlap >= correct overlap - 15 percentage points and >= 50%.

They are no longer silently ignorable. Every risk must be adjudicated:

- `keep` requires an allowed error type, the exact distractor and correct-option
  text, a verbatim passage evidence phrase, the exact wrong wording/relation, and
  a stem-specific reason;
- `rewrite` is returned when the options are genuinely ambiguous or no exact
  evidence can prove the intended error;
- unresolved risks are blocking quality errors;
- only the affected five-question passage group is repaired, preserving the
  passage, question numbers, fixed answers, paragraph targets, and question kinds.

Reviews are stored under `examSection.readingCRiskReviews` so a later re-audit
does not require another model call. A review is invalid if its option text no
longer matches, its passage quote is absent, or its distinction is generic.

## Verification

- `npm run typecheck` passed.
- `npm test` passed: 57 files / 389 tests before the final focused additions;
  focused Reading C tests passed after the additions.
- `npm run build` passed.
- Re-auditing paper
  `c0103483-d03a-4420-abd0-2718ba439724` now blocks on the one same-sentence risk
  and eight dual-support risks instead of passing them as warnings.
