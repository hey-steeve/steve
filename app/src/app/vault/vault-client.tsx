"use client";

import { pageMascots } from "../../chat/faces";
import { useState } from "react";
import { ChevronRightIcon, DocumentIcon, FeatureShell } from "../feature-shell";
import {
  summarizeTextDocumentAction,
  type AddDocumentActionResult,
  type VaultDocumentView,
} from "./vault-server";
import { FaceIdGate, type FaceIdTimings } from "./face-id-gate";
import "./vault.css";

export default function VaultClient(props: {
  readonly initialDocuments: readonly VaultDocumentView[];
  readonly onAddDocument?: (input: {
    readonly title: string;
    readonly text: string;
  }) => Promise<AddDocumentActionResult>;
  readonly faceIdTimings?: FaceIdTimings;
}) {
  const [documents, setDocuments] = useState<readonly VaultDocumentView[]>(
    props.initialDocuments,
  );
  const [selectedId, setSelectedId] = useState<string>(
    props.initialDocuments[0]?.id ?? "",
  );
  const [viewerOpen, setViewerOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected =
    documents.find((item) => item.id === selectedId) ?? documents[0] ?? null;

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const action = props.onAddDocument ?? summarizeTextDocumentAction;
      const result = await action({ title, text });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDocuments((current) => [result.document, ...current]);
      setSelectedId(result.document.id);
      setViewerOpen(false);
      setComposerOpen(false);
      setTitle("");
      setText("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FeatureShell
      current="/vault"
      title="Vault"
      subtitle="Your health documents, just for you."
      heroMascot={{ src: pageMascots.documents, width: 600, height: 600 }}
    >
      <FaceIdGate
        {...(props.faceIdTimings === undefined
          ? {}
          : { timings: props.faceIdTimings })}
      >
        {(lock) => (
          <>
            <button type="button" className="vault-lock-btn" onClick={lock}>
              Lock the Vault
            </button>
            {documents.map((doc) => (
              <button
                key={doc.id}
                type="button"
                className="vault-doc-card"
                aria-pressed={selected?.id === doc.id}
                onClick={() => {
                  setSelectedId(doc.id);
                  setViewerOpen(false);
                }}
              >
                <span className="vault-doc-icon" aria-hidden="true">
                  <DocumentIcon />
                  <span>{doc.formatLabel}</span>
                </span>
                <span className="vault-doc-meta">
                  <span className="vault-doc-title">{doc.title}</span>
                  <span className="steve-detail-secondary">
                    {doc.dateLabel}
                  </span>
                  <span className="steve-pill steve-pill-soft">
                    {doc.formatLabel}
                  </span>
                </span>
                <span className="steve-row-chevron" aria-hidden="true">
                  <ChevronRightIcon />
                </span>
              </button>
            ))}

            {selected === null ? null : (
              <section
                className="steve-card"
                aria-labelledby="vault-summary-title"
              >
                <h2 id="vault-summary-title" className="steve-card-title">
                  Document summary
                </h2>
                {selected.summaryLines.map((line, index) => (
                  <p key={`${index}-${line}`} className="vault-summary-text">
                    {line}
                  </p>
                ))}
                <button
                  type="button"
                  className="steve-btn-primary"
                  aria-expanded={viewerOpen}
                  onClick={() => setViewerOpen((open) => !open)}
                >
                  <DocumentIcon />
                  <span>
                    {viewerOpen ? "Close the document" : "Open the document"}
                  </span>
                </button>
                {viewerOpen ? (
                  <pre className="vault-content-box">
                    {selected.contentText}
                  </pre>
                ) : null}
              </section>
            )}

            <section className="steve-card">
              <button
                type="button"
                className="steve-btn-secondary"
                aria-expanded={composerOpen}
                onClick={() => {
                  setComposerOpen((open) => !open);
                  setError(null);
                }}
              >
                {composerOpen ? "Cancel" : "Add a text document"}
              </button>
              {composerOpen ? (
                <form
                  className="vault-add-form"
                  onSubmit={(event) => {
                    void handleAdd(event);
                  }}
                >
                  <div className="steve-field-group">
                    <label
                      className="steve-field-label"
                      htmlFor="vault-doc-title"
                    >
                      Document title
                    </label>
                    <input
                      id="vault-doc-title"
                      className="steve-input"
                      value={title}
                      placeholder="E.g. Administrative report"
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="steve-field-group">
                    <label
                      className="steve-field-label"
                      htmlFor="vault-doc-text"
                    >
                      Document text (synthetic data)
                    </label>
                    <textarea
                      id="vault-doc-text"
                      className="steve-textarea"
                      value={text}
                      placeholder="E.g. Administrative appointment confirmed on 4 December at 2 pm."
                      onChange={(event) => setText(event.target.value)}
                    />
                  </div>
                  {error === null ? null : (
                    <p className="steve-alert" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="steve-btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? "Saving…" : "Save and summarize"}
                  </button>
                </form>
              ) : null}
            </section>
          </>
        )}
      </FaceIdGate>
    </FeatureShell>
  );
}
