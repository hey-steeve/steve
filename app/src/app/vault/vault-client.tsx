"use client";

import { pageMascots } from "../../chat/faces";
import { useState } from "react";
import {
  ChevronRightIcon,
  DocumentIcon,
  FeatureShell,
} from "../feature-shell";
import {
  summarizeTextDocumentAction,
  type AddDocumentActionResult,
  type VaultDocumentView,
} from "./vault-server";
import "./vault.css";

export default function VaultClient(props: {
  readonly initialDocuments: readonly VaultDocumentView[];
  readonly onAddDocument?: (input: {
    readonly title: string;
    readonly text: string;
  }) => Promise<AddDocumentActionResult>;
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
      subtitle="Tes documents santé, rien qu’à toi."
      heroMascot={{ src: pageMascots.documents, width: 600, height: 600 }}
    >
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
            <span className="steve-detail-secondary">{doc.dateLabel}</span>
            <span className="steve-pill steve-pill-soft">{doc.formatLabel}</span>
          </span>
          <span className="steve-row-chevron" aria-hidden="true">
            <ChevronRightIcon />
          </span>
        </button>
      ))}

      {selected === null ? null : (
        <section className="steve-card" aria-labelledby="vault-summary-title">
          <h2 id="vault-summary-title" className="steve-card-title">
            Résumé du document
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
            <span>{viewerOpen ? "Fermer le document" : "Ouvrir le document"}</span>
          </button>
          {viewerOpen ? (
            <pre className="vault-content-box">{selected.contentText}</pre>
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
          {composerOpen ? "Annuler l’ajout" : "Ajouter un document texte"}
        </button>
        {composerOpen ? (
          <form
            className="vault-add-form"
            onSubmit={(event) => {
              void handleAdd(event);
            }}
          >
            <div className="steve-field-group">
              <label className="steve-field-label" htmlFor="vault-doc-title">
                Titre du document
              </label>
              <input
                id="vault-doc-title"
                className="steve-input"
                value={title}
                placeholder="Ex. Compte rendu administratif"
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="steve-field-group">
              <label className="steve-field-label" htmlFor="vault-doc-text">
                Texte du document (données synthétiques)
              </label>
              <textarea
                id="vault-doc-text"
                className="steve-textarea"
                value={text}
                placeholder="Ex. Rendez-vous administratif confirmé le 4 décembre à 14 h."
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            {error === null ? null : (
              <p className="steve-alert" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="steve-btn-primary" disabled={submitting}>
              {submitting ? "Enregistrement…" : "Enregistrer et résumer"}
            </button>
          </form>
        ) : null}
      </section>
    </FeatureShell>
  );
}
