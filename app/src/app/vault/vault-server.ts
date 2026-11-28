"use server";

import {
  createVault,
  InMemoryDocumentStorage,
  type FactualSummaryRequest,
} from "@steve/vault";

export interface VaultDocumentView {
  readonly id: string;
  readonly title: string;
  readonly fileName: string;
  readonly formatLabel: string;
  readonly dateLabel: string;
  readonly source: string;
  readonly summaryLines: readonly string[];
  readonly contentText: string;
}

const appointmentLetterText = [
  "Appointment letter — Nuages Mauves medical practice",
  "The letter states an appointment on 2 December at 10:00.",
  "Practitioner: Camille Lunéval (General practice).",
  "Address: 1 rue des Nuages Mauves, 75011 Paris.",
  "Please bring your carte Vitale and your administrative documents.",
].join("\n");

function factualExtractiveSummarizer(request: FactualSummaryRequest) {
  const lines = request.document.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8);
  const chosen = lines.find((line) => line.startsWith("The letter states")) ?? lines[0];
  const fallback = chosen ?? request.document.text.trim().slice(0, 180);
  return Promise.resolve({
    assertions: [
      {
        text: fallback,
        evidence: [fallback],
      },
    ],
  });
}

function createServerVault() {
  return createVault({
    storage: new InMemoryDocumentStorage(),
    summarizer: {
      summarize: factualExtractiveSummarizer,
    },
    now: () => new Date("2026-11-27T10:00:00Z"),
  });
}

function slugify(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "document" : slug;
}

function formatFrenchDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return isoDate;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export async function loadDemoVaultSnapshot(): Promise<readonly VaultDocumentView[]> {
  const vault = createServerVault();
  const stored = await vault.store({
    id: "doc-demo-rdv",
    fileName: "appointment-letter.txt",
    mimeType: "text/plain",
    content: new TextEncoder().encode(appointmentLetterText),
    metadata: {
      title: "Appointment letter",
      source: "Medical practice",
      documentDate: "2026-11-27",
    },
  });
  if (!stored.ok) {
    return [];
  }
  const summary = await vault.summarize(stored.value.id);
  const summaryLines = summary.ok
    ? summary.value.assertions.map((assertion) => assertion.text)
    : [];

  return [
    {
      id: stored.value.id,
      title: stored.value.metadata.title ?? stored.value.fileName,
      fileName: stored.value.fileName,
      formatLabel: "TXT",
      dateLabel: formatFrenchDate(stored.value.metadata.documentDate ?? "2026-11-27"),
      source: stored.value.metadata.source ?? "Practice",
      summaryLines,
      contentText: stored.value.extractedText,
    },
  ];
}

export type AddDocumentActionResult =
  | { readonly ok: true; readonly document: VaultDocumentView }
  | { readonly ok: false; readonly error: string };

export async function summarizeTextDocumentAction(input: {
  readonly title: string;
  readonly text: string;
}): Promise<AddDocumentActionResult> {
  if (typeof input?.title !== "string" || typeof input.text !== "string") {
    return {
      ok: false,
      error: "Enter a title and a text of at least 8 characters.",
    };
  }
  const title = input.title.trim();
  const text = input.text.trim();
  if (title.length === 0 || text.length < 8) {
    return {
      ok: false,
      error: "Enter a title and a text of at least 8 characters.",
    };
  }
  const vault = createServerVault();
  const stored = await vault.store({
    fileName: `${slugify(title)}.txt`,
    mimeType: "text/plain",
    content: new TextEncoder().encode(text),
    metadata: {
      title,
      source: "Added by patient",
      documentDate: "2026-11-27",
    },
  });
  if (!stored.ok) {
    return { ok: false, error: "Can’t save this document." };
  }
  const summary = await vault.summarize(stored.value.id);
  if (!summary.ok) {
    return { ok: false, error: "Can’t summarize this document." };
  }
  return {
    ok: true,
    document: {
      id: stored.value.id,
      title: stored.value.metadata.title ?? stored.value.fileName,
      fileName: stored.value.fileName,
      formatLabel: "TXT",
      dateLabel: formatFrenchDate("2026-11-27"),
      source: stored.value.metadata.source ?? "Added by patient",
      summaryLines: summary.value.assertions.map((assertion) => assertion.text),
      contentText: stored.value.extractedText,
    },
  };
}
