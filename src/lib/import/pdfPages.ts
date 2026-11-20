import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { readFile } from "@tauri-apps/plugin-fs";
import type { Cet6ContentStage } from "../types/cet";

const MAX_PDF_PAGES = 80;

export async function importSourceHash(paths: readonly string[]): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (const path of paths) {
    const bytes = await readFile(path);
    chunks.push(bytes);
    total += bytes.length;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", merged);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  let hash = 0x811c9dc5;
  for (const byte of merged) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function readImportFileAsPageImages(
  paths: readonly string[],
): Promise<Array<{ pageNumber: number; dataUrl: string; text: string }>> {
  const pages: Array<{ pageNumber: number; dataUrl: string; text: string }> = [];
  for (const path of paths) {
    const startPage = pages.length + 1;
    if (/\.pdf$/i.test(path)) {
      pages.push(...(await pdfToPageImages(path, startPage)));
    } else {
      pages.push({
        pageNumber: startPage,
        dataUrl: await imageFileToDataUrl(path),
        text: "",
      });
    }
  }
  return pages;
}

export function importedPageInstruction(input: {
  mode: "full" | "section";
  selectedStages: Cet6ContentStage[];
}): string {
  return `Convert this CET-6 exam page image into faithful, editable JSON.
Do not solve questions and do not invent missing text.

Mode: ${input.mode}
Selected stages: ${input.selectedStages.join(", ") || "all"}

Return exactly one JSON object and no prose:
{"title":"","examDate":"","setLabel":"","blocks":[{"groupId":"stable-slug","stage":"writing|listening-a|listening-b|listening-c|reading-a|reading-b|reading-c|translation","heading":"","examDate":"","setLabel":"","passage":"","optionBank":[],"questions":[{"sourceQuestionNumber":1,"content":"","options":[""],"answerLetter":"A","explanation":""}]}],"warnings":[]}

Rules:
- Preserve the printed question number in sourceQuestionNumber.
- Put options as text only, without A/B/C/D labels.
- Include answerLetter only when an answer is visibly printed.
- Put a shared passage or transcript on its block; preserve paragraph line breaks.
- Put the source sitting on each block when visible so composite passages keep provenance.
- Use the same groupId when a passage continues onto another page.
- For passage continuation pages, repeat the groupId and return only new text/questions.
- Ignore QR codes, advertisements, URLs, watermarks and page footers.
- Reading A stores the complete A-O bank in the block's optionBank. Legacy output may put the same bank in the first question's options.
- Reading B stores all printed paragraph letters as options; real papers may range A-M or A-O.
- Writing returns one question without sourceQuestionNumber.
- Translation returns one question without sourceQuestionNumber.
- An official set may omit Listening entirely; return no listening blocks instead of inventing them.
- If a requested selected stage is absent from this page, return an empty blocks array.`;
}

export function importedTextInstruction(input: {
  mode: "full" | "section";
  selectedStages: Cet6ContentStage[];
  setLabel: string;
  examDate: string;
}): string {
  return `Convert the supplied CET-6 OCR/text-layer pages into faithful editable JSON.
Do not solve questions and do not invent missing text.

Mode: ${input.mode}
Set: ${input.setLabel}
Exam date: ${input.examDate || "detect from text"}
Selected stages: ${input.selectedStages.join(", ") || "all"}

Return exactly one JSON object and no prose:
{"title":"","examDate":"","setLabel":"","blocks":[{"groupId":"stable-slug","stage":"writing|listening-a|listening-b|listening-c|reading-a|reading-b|reading-c|translation","heading":"","examDate":"","setLabel":"","passage":"","optionBank":[],"questions":[{"sourceQuestionNumber":1,"content":"","options":[""],"answerLetter":"A","explanation":""}]}],"warnings":[]}

Rules:
- Preserve printed question numbers in sourceQuestionNumber.
- Put options as text without A/B/C/D labels.
- Include answerLetter only when visibly printed.
- Reconstruct shared passages/transcripts and preserve paragraph breaks.
- Ignore QR codes, ads, watermarks, page headers and footers.
- Reading A: 10 blanks and a shared A-O bank in block.optionBank.
- Reading B: statements 36-45 with paragraph letters A-M or A-O, matching the source.
- Reading C: two passage groups and questions 46-55.
- Writing and translation each return one task without sourceQuestionNumber.
- An official set may omit Listening entirely; do not synthesize a missing listening section.
- Report uncertain page splits and missing fields in warnings; never hallucinate.`;
}

async function pdfToPageImages(
  path: string,
  startPage: number,
): Promise<Array<{ pageNumber: number; dataUrl: string; text: string }>> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const bytes = await readFile(path);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new Error("importTooManyPages");
  }
  const results: Array<{ pageNumber: number; dataUrl: string; text: string }> = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(2.6, Math.max(1.4, 1700 / base.width));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("importCanvasUnavailable");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item) =>
            "str" in item && typeof item.str === "string" ? item.str : "",
          )
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        results.push({
          pageNumber: startPage + pageNumber - 1,
          dataUrl: canvas.toDataURL("image/jpeg", 0.9),
          text,
        });
        canvas.width = 1;
        canvas.height = 1;
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdf.destroy();
  }
  return results;
}

async function imageFileToDataUrl(path: string): Promise<string> {
  const bytes = await readFile(path);
  const extension = path.split(".").pop()?.toLowerCase();
  const mime =
    extension === "png"
      ? "image/png"
      : extension === "webp"
        ? "image/webp"
        : extension === "gif"
          ? "image/gif"
          : "image/jpeg";
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}
