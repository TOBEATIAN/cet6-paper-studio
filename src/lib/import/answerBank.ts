import { AnswerBankSchema, type AnswerBank, type AnswerBankEntry } from "../types/answerBank";
import { AnswerSearchResultSchema, type AnswerSearchResult, type AnswerSearchRow, type ImportedBlock, type ImportedPaperDraft } from "../types/import";
import { answerTableForDraft } from "./realExamImport";

export function emptyAnswerBank(): AnswerBank {
  return AnswerBankSchema.parse({ entries: [] });
}

export function mergeAnswerBank(
  current: AnswerBank | null,
  incoming: AnswerBank,
): AnswerBank {
  const entries = new Map<string, AnswerBankEntry>();
  for (const entry of current?.entries ?? []) entries.set(entry.id, entry);
  for (const entry of incoming.entries) entries.set(entry.id, entry);
  return AnswerBankSchema.parse({
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [...entries.values()],
  });
}

export function lookupBankAnswers(
  draft: ImportedPaperDraft,
  bank: AnswerBank,
): AnswerSearchResult {
  const base = answerTableForDraft(draft);
  const rows = base.rows.map((row) => {
    if (
      row.answerLetter &&
      (row.status === "official" || row.status === "manual")
    ) {
      return row;
    }
    const block = draft.blocks.find(
      (candidate) =>
        candidate.stage === row.stage && candidate.groupId === row.groupId,
    );
    if (!block) return row;
    const matching = bank.entries.filter((entry) =>
      isBankEntryMatch(entry, row, block, draft),
    );
    if (matching.length === 0) return row;
    const answers = new Set(
      matching.map((entry) => entry.answerLetter.toUpperCase()),
    );
    const sources = dedupeSources(matching.flatMap((entry) => entry.sources));
    if (answers.size > 1) {
      return { ...row, status: "conflict" as const, sources };
    }
    return {
      ...row,
      answerLetter: [...answers][0],
      status: "bank" as const,
      sources,
    };
  });
  return AnswerSearchResultSchema.parse({
    rows,
    query: "",
    notes: [],
  });
}

export function entriesFromConfirmedDraft(
  draft: ImportedPaperDraft,
  rows: readonly AnswerSearchRow[],
): AnswerBankEntry[] {
  const confirmedAt = new Date().toISOString();
  return rows.flatMap((row) => {
    if (
      !row.answerLetter ||
      row.status === "conflict" ||
      row.status === "missing"
    ) {
      return [];
    }
    const block = draft.blocks.find(
      (candidate) =>
        candidate.stage === row.stage && candidate.groupId === row.groupId,
    );
    if (!block) return [];
    const examDate = block.examDate || draft.examDate;
    const setLabel = block.setLabel || draft.setLabel;
    return [
      {
        id: entryId(examDate, setLabel, row.stage, row.groupId, row.sourceQuestionNumber),
        examDate,
        setLabel,
        stage: row.stage,
        groupId: row.groupId,
        sourceQuestionNumber: row.sourceQuestionNumber,
        answerLetter: row.answerLetter.toUpperCase(),
        status: row.status,
        sources: row.sources,
        signature: passageSignature(block.passage),
        confirmedAt,
      },
    ];
  });
}

function isBankEntryMatch(
  entry: AnswerBankEntry,
  row: AnswerSearchRow,
  block: ImportedBlock,
  draft: ImportedPaperDraft,
): boolean {
  if (
    entry.stage !== row.stage ||
    entry.sourceQuestionNumber !== row.sourceQuestionNumber
  ) {
    return false;
  }
  const examDate = block.examDate || draft.examDate;
  const setLabel = block.setLabel || draft.setLabel;
  const metadataMatch =
    normalizeLabel(entry.examDate) === normalizeLabel(examDate) &&
    normalizeLabel(entry.setLabel) === normalizeLabel(setLabel) &&
    Boolean(examDate || setLabel);
  const groupMatch =
    Boolean(entry.groupId) &&
    normalizeLabel(entry.groupId) === normalizeLabel(block.groupId);
  const signature = passageSignature(block.passage);
  if (!signature.first && !signature.last) {
    return metadataMatch || groupMatch;
  }
  if (!entry.signature.first && !entry.signature.last) {
    return metadataMatch || groupMatch;
  }
  const similarity = signatureSimilarity(signature, entry.signature);
  return similarity >= 0.62 || (similarity >= 0.45 && (metadataMatch || groupMatch));
}

function passageSignature(text: string) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return {
    first: tokens.slice(0, 18).join(" "),
    last: tokens.slice(Math.max(18, tokens.length - 18)).join(" "),
    wordCount: tokens.length,
  };
}

function signatureSimilarity(
  left: { first: string; last: string; wordCount: number },
  right: { first: string; last: string; wordCount: number },
): number {
  const leftWords = tokenSet(`${left.first} ${left.last}`);
  const rightWords = tokenSet(`${right.first} ${right.last}`);
  if (leftWords.size === 0 || rightWords.size === 0) return 0;
  let shared = 0;
  for (const word of leftWords) if (rightWords.has(word)) shared += 1;
  const jaccard = shared / (leftWords.size + rightWords.size - shared);
  const countSimilarity =
    1 -
    Math.abs(left.wordCount - right.wordCount) /
      Math.max(1, left.wordCount, right.wordCount);
  return jaccard * 0.85 + countSimilarity * 0.15;
}

function tokenSet(text: string): Set<string> {
  return new Set(text.split(/\s+/).filter(Boolean));
}

function dedupeSources(
  sources: AnswerSearchRow["sources"],
): AnswerSearchRow["sources"] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function entryId(
  examDate: string,
  setLabel: string,
  stage: string,
  groupId: string,
  number: number,
): string {
  return [examDate, setLabel, stage, groupId, number]
    .map((value) => normalizeLabel(String(value)))
    .filter(Boolean)
    .join("|");
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[\s_\-—:：/]+/g, "");
}
