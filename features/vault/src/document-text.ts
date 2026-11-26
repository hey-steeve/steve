import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  vaultLimits,
  type StoredDocument,
  type VaultError,
  type VaultResult,
} from "./contracts.ts";

function failure(
  code: VaultError["code"],
  message: string,
): VaultResult<never> {
  return { ok: false, error: { code, message, field: "content" } };
}

function decodeUtf8(content: Uint8Array): VaultResult<string> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return failure(
      "INVALID_DOCUMENT",
      "Document content must be valid UTF-8 text.",
    );
  }
  if (text.trim() === "" || text.includes("\u0000")) {
    return failure(
      "INVALID_DOCUMENT",
      "Document content must contain text.",
    );
  }
  return { ok: true, value: text };
}

async function extractPdfText(content: Uint8Array): Promise<VaultResult<string>> {
  const loadingTask = getDocument({
    data: new Uint8Array(content),
    disableFontFace: true,
    enableXfa: false,
    stopAtErrors: true,
    useSystemFonts: true,
    useWorkerFetch: false,
  });
  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages < 1 || pdf.numPages > vaultLimits.pdfPages) {
      return failure(
        "CONTENT_TOO_LARGE",
        "PDF document exceeds the page limit.",
      );
    }
    let extracted = "";
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const textContent = await page.getTextContent();
        for (const item of textContent.items) {
          if (!("str" in item) || typeof item.str !== "string") {
            continue;
          }
          const separator = item.hasEOL ? "\n" : " ";
          extracted += `${item.str}${separator}`;
          if (extracted.length > vaultLimits.extractedTextCharacters) {
            return failure(
              "CONTENT_TOO_LARGE",
              "PDF extracted text exceeds the size limit.",
            );
          }
        }
      } finally {
        page.cleanup();
      }
      if (pageNumber < pdf.numPages) {
        extracted += "\n";
      }
    }
    const text = extracted.trim();
    if (text === "" || text.includes("\u0000")) {
      return failure(
        "INVALID_DOCUMENT",
        "PDF document must contain extractable text.",
      );
    }
    return { ok: true, value: text };
  } catch {
    return failure(
      "INVALID_DOCUMENT",
      "PDF document could not be parsed safely.",
    );
  } finally {
    try {
      await loadingTask.destroy();
    } catch {
      // Loading has already failed and no document content is exposed here.
    }
  }
}

export function extractDocumentText(
  document: StoredDocument,
): Promise<VaultResult<string>> {
  if (document.mimeType === "application/pdf") {
    return extractPdfText(document.content);
  }
  return Promise.resolve(decodeUtf8(document.content));
}
