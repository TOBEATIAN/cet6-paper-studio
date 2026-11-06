import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import type { Question } from "../../lib/types/exam";
import { Field, TextInput, TextArea, ListEditor, inputCls } from "./editFields";

interface TypeFieldsProps {
  draft: Question;
  onChange: (next: Question) => void;
}

const optionLetter = (i: number) => `${String.fromCharCode(65 + i)}.`;

/**
 * Renders the type-specific fields for the question editor. Each branch edits
 * the discriminated-union variant's extra fields and emits an updated draft.
 */
export function TypeFields({ draft, onChange }: TypeFieldsProps) {
  const { t } = useTranslation();

  switch (draft.type) {
    case "single-choice":
      return (
        <>
          <Field label={t("paper.optionsLabel")}>
            <ListEditor
              items={draft.options}
              onChange={(options) => onChange({ ...draft, options })}
              addLabel={t("paper.addOption")}
              removeLabel={t("paper.removeOption")}
              prefix={optionLetter}
              minItems={2}
            />
          </Field>
          <Field label={t("paper.correctAnswer")}>
            <select
              value={draft.correctAnswer}
              onChange={(e) =>
                onChange({ ...draft, correctAnswer: Number(e.currentTarget.value) })
              }
              className={inputCls}
            >
              {draft.options.map((_, i) => (
                <option key={i} value={i}>
                  {optionLetter(i)}
                </option>
              ))}
            </select>
          </Field>
        </>
      );

    case "multiple-choice":
      return (
        <>
          <Field label={t("paper.optionsLabel")}>
            <ListEditor
              items={draft.options}
              onChange={(options) => onChange({ ...draft, options })}
              addLabel={t("paper.addOption")}
              removeLabel={t("paper.removeOption")}
              prefix={optionLetter}
              minItems={2}
            />
          </Field>
          <Field label={t("paper.correctAnswers")}>
            <div className="flex flex-wrap gap-3">
              {draft.options.map((_, i) => {
                const checked = draft.correctAnswers.includes(i);
                return (
                  <label key={i} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const set = new Set(draft.correctAnswers);
                        if (e.currentTarget.checked) set.add(i);
                        else set.delete(i);
                        onChange({
                          ...draft,
                          correctAnswers: [...set].sort((a, b) => a - b),
                        });
                      }}
                    />
                    {optionLetter(i)}
                  </label>
                );
              })}
            </div>
          </Field>
        </>
      );

    case "true-false":
      return (
        <Field label={t("paper.correctAnswer")}>
          <select
            value={draft.correctAnswer ? "true" : "false"}
            onChange={(e) =>
              onChange({ ...draft, correctAnswer: e.currentTarget.value === "true" })
            }
            className={inputCls}
          >
            <option value="true">{t("paper.true")}</option>
            <option value="false">{t("paper.false")}</option>
          </select>
        </Field>
      );

    case "fill-in-blank":
      return (
        <Field label={t("paper.blanksLabel")}>
          <ListEditor
            items={draft.blanks}
            onChange={(blanks) => onChange({ ...draft, blanks })}
            addLabel={t("paper.addBlank")}
            removeLabel={t("paper.removeBlank")}
            prefix={(i) => `${i + 1}.`}
          />
        </Field>
      );

    case "short-answer":
      return (
        <>
          <Field label={t("paper.referenceAnswer")}>
            <TextArea
              value={draft.referenceAnswer}
              onChange={(referenceAnswer) =>
                onChange({ ...draft, referenceAnswer })
              }
            />
          </Field>
          <Field label={t("paper.scoringPoints")}>
            <ListEditor
              items={draft.scoringPoints ?? []}
              onChange={(scoringPoints) =>
                onChange({
                  ...draft,
                  scoringPoints: scoringPoints.length ? scoringPoints : undefined,
                })
              }
              addLabel={t("paper.addScoringPoint")}
              removeLabel={t("paper.removeScoringPoint")}
              minItems={0}
            />
          </Field>
          {draft.examSection?.kind === "cet-translation" && (
            <Field label={t("paper.translationGlossary")}>
              <div className="space-y-2">
                {(draft.examSection.glossary ?? []).map((entry, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <TextInput
                      value={entry.zh}
                      placeholder={t("paper.glossaryChinese")}
                      onChange={(zh) => {
                        const glossary = [...(draft.examSection?.glossary ?? [])];
                        glossary[index] = { ...entry, zh };
                        onChange({
                          ...draft,
                          examSection: {
                            ...draft.examSection,
                            kind: "cet-translation",
                            glossary,
                          },
                        });
                      }}
                    />
                    <TextInput
                      value={entry.en}
                      placeholder={t("paper.glossaryEnglish")}
                      onChange={(en) => {
                        const glossary = [...(draft.examSection?.glossary ?? [])];
                        glossary[index] = { ...entry, en };
                        onChange({
                          ...draft,
                          examSection: {
                            ...draft.examSection,
                            kind: "cet-translation",
                            glossary,
                          },
                        });
                      }}
                    />
                    <button
                      type="button"
                      aria-label={t("paper.removeGlossary")}
                      onClick={() =>
                        onChange({
                          ...draft,
                          examSection: {
                            ...draft.examSection,
                            kind: "cet-translation",
                            glossary: (draft.examSection?.glossary ?? []).filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          },
                        })
                      }
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...draft,
                      examSection: {
                        ...draft.examSection,
                        kind: "cet-translation",
                        glossary: [
                          ...(draft.examSection?.glossary ?? []),
                          { zh: "", en: "" },
                        ],
                      },
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  <Plus className="h-4 w-4" />
                  {t("paper.addGlossary")}
                </button>
              </div>
            </Field>
          )}
        </>
      );

    case "essay":
      return (
        <>
          <Field label={t("paper.writingGuidance")}>
            <TextArea
              value={draft.writingGuidance ?? ""}
              onChange={(writingGuidance) =>
                onChange({
                  ...draft,
                  writingGuidance: writingGuidance || undefined,
                })
              }
            />
          </Field>
          <Field label={t("paper.scoringCriteria")}>
            <TextArea
              value={draft.scoringCriteria}
              onChange={(scoringCriteria) =>
                onChange({ ...draft, scoringCriteria })
              }
            />
          </Field>
        </>
      );

    case "calculation":
      return (
        <>
          <Field label={t("paper.solution")}>
            <TextArea
              value={draft.solution}
              onChange={(solution) => onChange({ ...draft, solution })}
            />
          </Field>
          <Field label={t("paper.answer")}>
            <TextInput
              value={draft.answer}
              onChange={(answer) => onChange({ ...draft, answer })}
            />
          </Field>
        </>
      );
  }
}
