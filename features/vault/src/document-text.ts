import { Worker } from "node:worker_threads";
import {
  vaultLimits,
  type VaultError,
  type VaultResult,
} from "./contracts.ts";

const pdfExtractionTimeoutMilliseconds = 1_500;
const pdfWorkerStartupTimeoutMilliseconds = 5_000;
const pdfWorkerResourceLimits = Object.freeze({
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  codeRangeSizeMb: 16,
  stackSizeMb: 4,
});
let activePdfExtractions = 0;

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
  if (activePdfExtractions >= vaultLimits.concurrentPdfExtractions) {
    return failure(
      "PROCESSING_BUSY",
      "PDF extraction capacity is busy. Retry later.",
    );
  }
  activePdfExtractions += 1;
  return new Promise((resolve) => {
    let workerContent: Uint8Array<ArrayBuffer>;
    let worker: Worker;
    try {
      workerContent = new Uint8Array(content);
      worker = new Worker(new URL("./pdf-text-worker.mjs", import.meta.url), {
        workerData: {
          content: workerContent,
          pageLimit: vaultLimits.pdfPages,
          textLimit: vaultLimits.extractedTextCharacters,
        },
        transferList: [workerContent.buffer],
        resourceLimits: pdfWorkerResourceLimits,
      });
    } catch {
      activePdfExtractions -= 1;
      resolve(failure(
        "DEPENDENCY_FAILURE",
        "PDF extraction worker could not be started.",
      ));
      return;
    }
    let startupTimeout: ReturnType<typeof setTimeout> | undefined;
    let extractionTimeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const settle = (result: VaultResult<string>): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(startupTimeout);
      clearTimeout(extractionTimeout);
      worker.removeAllListeners();
      void worker.terminate().then(
        () => {
          activePdfExtractions -= 1;
          resolve(result);
        },
        () => {
          resolve(failure(
            "DEPENDENCY_FAILURE",
            "PDF extraction worker could not be stopped safely.",
          ));
        },
      );
    };
    startupTimeout = setTimeout(() => {
      settle(failure(
        "DEPENDENCY_FAILURE",
        "PDF extraction worker did not start safely.",
      ));
    }, pdfWorkerStartupTimeoutMilliseconds);
    worker.once("online", () => {
      clearTimeout(startupTimeout);
      startupTimeout = undefined;
      extractionTimeout = setTimeout(() => {
        settle(failure(
          "CONTENT_TOO_LARGE",
          "PDF document exceeded safe processing limits.",
        ));
      }, pdfExtractionTimeoutMilliseconds);
    });
    worker.once("message", (message: unknown) => {
      const kind = message !== null && typeof message === "object"
        ? Reflect.get(message, "kind")
        : undefined;
      const text = message !== null && typeof message === "object"
        ? Reflect.get(message, "text")
        : undefined;
      if (
        kind === "ok" &&
        typeof text === "string" &&
        text.length > 0 &&
        text.length <= vaultLimits.extractedTextCharacters &&
        text === text.trim() &&
        !text.includes("\u0000")
      ) {
        settle({ ok: true, value: text });
        return;
      }
      if (kind === "too-large") {
        settle(failure(
          "CONTENT_TOO_LARGE",
          "PDF document exceeds safe processing limits.",
        ));
        return;
      }
      settle(failure(
        "INVALID_DOCUMENT",
        "PDF document could not be parsed safely.",
      ));
    });
    worker.once("error", () => {
      settle(failure(
        "CONTENT_TOO_LARGE",
        "PDF document exceeded safe processing limits.",
      ));
    });
    worker.once("exit", (code) => {
      if (code !== 0) {
        settle(failure(
          "CONTENT_TOO_LARGE",
          "PDF document exceeded safe processing limits.",
        ));
      }
    });
  });
}

export function extractDocumentText(
  mimeType: "text/plain" | "text/markdown" | "application/pdf",
  content: Uint8Array,
): Promise<VaultResult<string>> {
  if (mimeType === "application/pdf") {
    return extractPdfText(content);
  }
  return Promise.resolve(decodeUtf8(content));
}
