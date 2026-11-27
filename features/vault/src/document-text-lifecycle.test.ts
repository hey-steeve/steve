import { afterEach, describe, expect, test, vi } from "vitest";

type ControlledWorker = {
  emit(event: string, ...arguments_: unknown[]): boolean;
  readonly terminateCalls: number;
  finishTermination(): void;
};

const workerHarness = vi.hoisted<{ workers: ControlledWorker[] }>(() => ({
  workers: [],
}));

vi.mock("node:worker_threads", async () => {
  const { EventEmitter } = await import("node:events");

  class Worker extends EventEmitter {
    readonly #termination: Promise<number>;
    #resolveTermination: (code: number) => void = () => {};
    terminateCalls = 0;

    constructor() {
      super();
      this.#termination = new Promise((resolve) => {
        this.#resolveTermination = resolve;
      });
      workerHarness.workers.push(this);
    }

    terminate(): Promise<number> {
      this.terminateCalls += 1;
      return this.#termination;
    }

    finishTermination(): void {
      this.#resolveTermination(0);
    }
  }

  return { Worker };
});

import { extractDocumentText } from "./document-text.ts";

function latestWorker(): ControlledWorker {
  const worker = workerHarness.workers.at(-1);
  if (worker === undefined) {
    throw new Error("worker fixture was not created");
  }
  return worker;
}

function extractPdf() {
  return extractDocumentText(
    "application/pdf",
    new TextEncoder().encode("%PDF-synthetic-worker-fixture"),
  );
}

afterEach(() => {
  vi.useRealTimers();
  workerHarness.workers.length = 0;
});

describe("PDF worker lifecycle", () => {
  test("starts the extraction budget after online and resolves after termination", async () => {
    vi.useFakeTimers();
    let resolved = false;
    const extraction = extractPdf().then((result) => {
      resolved = true;
      return result;
    });
    const worker = latestWorker();

    await vi.advanceTimersByTimeAsync(1_500);
    expect(resolved).toBe(false);

    worker.emit("online");
    await vi.advanceTimersByTimeAsync(1_499);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(worker.terminateCalls).toBe(1);
    expect(resolved).toBe(false);

    worker.finishTermination();
    await expect(extraction).resolves.toMatchObject({
      ok: false,
      error: { code: "CONTENT_TOO_LARGE" },
    });
  });

  test("fails a worker that never reaches online within the startup guard", async () => {
    vi.useFakeTimers();
    let resolved = false;
    const extraction = extractPdf().then((result) => {
      resolved = true;
      return result;
    });
    const worker = latestWorker();

    await vi.advanceTimersByTimeAsync(4_999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(worker.terminateCalls).toBe(1);
    expect(resolved).toBe(false);

    worker.finishTermination();
    await expect(extraction).resolves.toMatchObject({
      ok: false,
      error: { code: "DEPENDENCY_FAILURE" },
    });
  });

  test("keeps capacity occupied until the worker has terminated", async () => {
    vi.useFakeTimers();
    const first = extractPdf();
    const firstWorker = latestWorker();
    const second = extractPdf();
    const secondWorker = latestWorker();

    await expect(extractPdf()).resolves.toMatchObject({
      ok: false,
      error: { code: "PROCESSING_BUSY" },
    });

    firstWorker.emit("online");
    firstWorker.emit("message", { kind: "ok", text: "Synthetic text." });
    expect(firstWorker.terminateCalls).toBe(1);
    await expect(extractPdf()).resolves.toMatchObject({
      ok: false,
      error: { code: "PROCESSING_BUSY" },
    });

    firstWorker.finishTermination();
    await expect(first).resolves.toEqual({
      ok: true,
      value: "Synthetic text.",
    });

    const afterTermination = extractPdf();
    const replacementWorker = latestWorker();

    secondWorker.emit("online");
    secondWorker.emit("message", { kind: "invalid" });
    secondWorker.finishTermination();
    replacementWorker.emit("online");
    replacementWorker.emit("message", {
      kind: "ok",
      text: "Replacement text.",
    });
    replacementWorker.finishTermination();

    await expect(second).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT" },
    });
    await expect(afterTermination).resolves.toEqual({
      ok: true,
      value: "Replacement text.",
    });
  });
});
