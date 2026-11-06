export interface TranslationGlossaryEntry {
  zh: string;
  en: string;
}

/** Insert "中文(English hint)" after the first occurrence of each glossary term. */
export function applyTranslationGlossary(
  text: string,
  glossary: readonly TranslationGlossaryEntry[] | undefined,
): string {
  if (!glossary?.length) return text;
  let output = text;
  for (const entry of glossary) {
    const zh = entry.zh.trim();
    const en = entry.en.trim();
    if (!zh || !en) continue;
    const index = output.indexOf(zh);
    if (index < 0) continue;
    const after = output.slice(index + zh.length);
    if (after.startsWith(`(${en})`) || after.startsWith(`（${en}）`)) {
      continue;
    }
    output = output.slice(0, index + zh.length) + `(${en})` + after;
  }
  return output;
}
