import { parentPort, workerData } from "node:worker_threads";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

function finish(result) {
  parentPort?.postMessage(result);
  parentPort?.close();
}

async function extract() {
  if (
    parentPort === null ||
    workerData === null ||
    typeof workerData !== "object" ||
    !(workerData.content instanceof Uint8Array) ||
    !Number.isInteger(workerData.pageLimit) ||
    !Number.isInteger(workerData.textLimit)
  ) {
    return { kind: "invalid" };
  }

  const loadingTask = getDocument({
    data: workerData.content,
    disableFontFace: true,
    enableXfa: false,
    stopAtErrors: true,
    useSystemFonts: true,
    useWorkerFetch: false,
  });
  try {
    const pdf = await loadingTask.promise;
    if (pdf.numPages < 1 || pdf.numPages > workerData.pageLimit) {
      return { kind: "too-large" };
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
          extracted += `${item.str}${item.hasEOL ? "\n" : " "}`;
          if (extracted.length > workerData.textLimit) {
            return { kind: "too-large" };
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
    return text === "" || text.includes("\u0000")
      ? { kind: "invalid" }
      : { kind: "ok", text };
  } catch {
    return { kind: "invalid" };
  } finally {
    try {
      await loadingTask.destroy();
    } catch {
      // No parsed content is returned after cleanup failure.
    }
  }
}

finish(await extract());
