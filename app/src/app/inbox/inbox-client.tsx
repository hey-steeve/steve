"use client";

import { pageMascots } from "../../chat/faces";
import {
  createInbox,
  InMemoryInboxStorage,
  ScriptedInboundMessageClassifier,
  type Inbox,
  type InboxEvent,
  type MailGateway,
  type NormalizedInboundMessage,
} from "@steve/inbox";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CalendarIcon,
  ChevronRightIcon,
  CopyIcon,
  DocumentIcon,
  FeatureShell,
  MailIcon,
  UploadIcon,
} from "../feature-shell";
import "./inbox.css";

const steveAddress = "peter@steve.example";

const demoInboundMessages: readonly NormalizedInboundMessage[] = [
  {
    providerMessageId: "msg-demo-confirmation-1",
    from: "cabinet.luneval@example.test",
    to: steveAddress,
    subject: "Confirmation de rendez-vous",
    textBody: "Votre rendez-vous avec Camille Lunéval est prévu le 2 décembre à 10 h.",
    attachments: [],
    receivedAt: "2026-11-27T09:15:00Z",
  },
  {
    providerMessageId: "msg-demo-report-1",
    from: "secretariat.luneval@example.test",
    to: steveAddress,
    subject: "Document du cabinet",
    textBody: "Veuillez trouver ci-joint votre lettre de rendez-vous.",
    attachments: [
      {
        id: "att-demo-1",
        fileName: "lettre-de-rendez-vous.pdf",
        mimeType: "application/pdf",
        bytes: new TextEncoder().encode("Lettre de rendez-vous — 2 décembre à 10 h."),
      },
    ],
    receivedAt: "2026-11-27T09:30:00Z",
  },
];

const initialEvents: readonly InboxEvent[] = [
  {
    type: "appointment-confirmation-received",
    provenance: {
      providerMessageId: "msg-demo-confirmation-1",
      from: "cabinet.luneval@example.test",
      to: steveAddress,
      subject: "Confirmation de rendez-vous",
      receivedAt: "2026-11-27T09:15:00Z",
    },
    confirmation: {
      reference: "CONF-0001",
      startsAt: "2026-12-02T10:00:00+01:00",
      endsAt: "2026-12-02T10:30:00+01:00",
      practitionerName: "Camille Lunéval",
    },
    requiresOwnerValidation: true,
  },
  {
    type: "document-received",
    provenance: {
      providerMessageId: "msg-demo-report-1",
      from: "secretariat.luneval@example.test",
      to: steveAddress,
      subject: "Document du cabinet",
      receivedAt: "2026-11-27T09:30:00Z",
    },
    document: {
      id: "att-demo-1",
      fileName: "lettre-de-rendez-vous.pdf",
      mimeType: "application/pdf",
      bytes: new TextEncoder().encode("Lettre de rendez-vous — 2 décembre à 10 h."),
    },
    verification: "unverified",
  },
];

function createDemoInbox(): Inbox {
  const classifier = new ScriptedInboundMessageClassifier([
    {
      providerMessageId: "msg-demo-confirmation-1",
      steps: [
        {
          type: "appointment-confirmation",
          reference: "CONF-0001",
          startsAt: "2026-12-02T10:00:00+01:00",
          endsAt: "2026-12-02T10:30:00+01:00",
          practitionerName: "Camille Lunéval",
        },
      ],
    },
    {
      providerMessageId: "msg-demo-report-1",
      steps: [
        {
          type: "report",
          attachmentIds: ["att-demo-1"],
        },
      ],
    },
  ]);

  let sentCounter = 0;
  const mailGateway: MailGateway = {
    async send() {
      sentCounter += 1;
      return {
        status: "sent",
        providerMessageId: `out-demo-${sentCounter}`,
        sentAt: "2026-11-27T10:05:00Z",
      };
    },
  };

  return createInbox({
    classifier,
    mailGateway,
    storage: new InMemoryInboxStorage(),
    clock: { now: () => "2026-11-27T10:05:00Z" },
  });
}

export default function InboxClient() {
  const inboxRef = useRef<Inbox | null>(null);
  const requestCounter = useRef(0);
  const [events, setEvents] = useState<readonly InboxEvent[]>(initialEvents);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [sendOpen, setSendOpen] = useState(false);
  const [recipient, setRecipient] = useState("cabinet.luneval@example.test");
  const [subject, setSubject] = useState("Transmission de ma lettre de rendez-vous");
  const [authorized, setAuthorized] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [sendStatus, setSendStatus] = useState<{ readonly kind: "ok" | "error"; readonly text: string } | null>(null);

  useEffect(() => {
    const inbox = createDemoInbox();
    inboxRef.current = inbox;
    void (async () => {
      const collected: InboxEvent[] = [];
      for (const message of demoInboundMessages) {
        const result = await inbox.ingestMessage(message);
        if (result.status === "processed") {
          collected.push(...result.events);
        }
      }
      if (collected.length > 0) {
        setEvents(collected);
      }
    })();
  }, []);

  async function handleCopyAddress() {
    try {
      if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
        setCopyState("failed");
        return;
      }
      await navigator.clipboard.writeText(steveAddress);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function handleSendDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current) return;
    setSendStatus(null);
    if (!authorized) {
      setSendStatus({
        kind: "error",
        text: "Confirme ton autorisation avant d’envoyer un document à un praticien.",
      });
      return;
    }
    const inbox = inboxRef.current ?? createDemoInbox();
    inboxRef.current = inbox;
    const practitionerEmail = recipient.trim();
    sendingRef.current = true;
    setSending(true);
    requestCounter.current += 1;
    let outcome: Awaited<ReturnType<Inbox["sendDocument"]>>;
    try {
      outcome = await inbox.sendDocument({
        requestId: `send-demo-${requestCounter.current}`,
        practitionerEmail,
        subject: subject.trim(),
        textBody: "Document transmis depuis la messagerie Steve (données de démonstration).",
        attachments: [
          {
            id: "att-out-1",
            fileName: "lettre-de-rendez-vous.pdf",
            mimeType: "application/pdf",
            bytes: new TextEncoder().encode("Lettre de rendez-vous — données de démonstration."),
          },
        ],
        authorization: { authorized: true },
      });
    } catch {
      setSendStatus({
        kind: "error",
        text: "Impossible d’envoyer ce document pour le moment. Réessaie dans un instant.",
      });
      return;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
    if (outcome.status !== "sent") {
      setSendStatus({
        kind: "error",
        text: "Impossible d’envoyer ce document. Vérifie l’adresse du destinataire.",
      });
      return;
    }
    setSendStatus({
      kind: "ok",
      text: `Envoi simulé à ${practitionerEmail} (réf. ${outcome.providerMessageId}). Rien n’a quitté la démonstration.`,
    });
    setSendOpen(false);
    setAuthorized(false);
  }

  return (
    <FeatureShell
      current="/inbox"
      title="Ma messagerie"
      heroMascot={{ src: pageMascots.inbox, width: 600, height: 600 }}
    >
      <section className="steve-card" aria-labelledby="inbox-address-title">
        <h2 id="inbox-address-title" className="steve-card-title">
          Ton adresse Steve
        </h2>
        <div className="inbox-address-row">
          <MailIcon />
          <span className="inbox-address-text">{steveAddress}</span>
          <button
            type="button"
            className="inbox-copy-btn"
            aria-label="Copier l’adresse Steve"
            onClick={() => {
              void handleCopyAddress();
            }}
          >
            <CopyIcon />
          </button>
        </div>
        {copyState === "copied" ? (
          <p className="steve-status" role="status">
            Adresse copiée : {steveAddress}
          </p>
        ) : null}
        {copyState === "failed" ? (
          <p className="steve-alert" role="alert">
            Copie impossible. Sélectionne l’adresse pour la copier à la main.
          </p>
        ) : null}
      </section>

      <section className="steve-card" aria-labelledby="inbox-received-title">
        <h2 id="inbox-received-title" className="steve-card-title">
          Reçus
        </h2>
        <ul className="steve-row-list">
          {events.map((item) => {
            const id = item.provenance.providerMessageId;
            const isConfirmation = item.type === "appointment-confirmation-received";
            const expanded = selectedId === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  className="steve-row-button"
                  aria-expanded={expanded}
                  onClick={() => setSelectedId((current) => (current === id ? null : id))}
                >
                  {isConfirmation ? <CalendarIcon /> : <DocumentIcon />}
                  <span className="inbox-item-copy">
                    <span className="inbox-item-title">
                      {isConfirmation
                        ? "Confirmation de rendez-vous"
                        : "Document du cabinet"}
                    </span>
                    <span className={isConfirmation ? "steve-pill steve-pill-warning" : "steve-pill"}>
                      {isConfirmation ? "À vérifier" : "Document reçu"}
                    </span>
                  </span>
                  <span className="steve-row-chevron" aria-hidden="true">
                    <ChevronRightIcon />
                  </span>
                </button>
                {expanded ? (
                  <div className="inbox-detail-panel">
                    <span className="steve-detail-secondary">
                      De : {item.provenance.from}
                    </span>
                    {isConfirmation ? (
                      <>
                        <span className="steve-detail-primary">
                          {item.confirmation.practitionerName ?? "Praticien"} · Réf.{" "}
                          {item.confirmation.reference}
                        </span>
                        <span className="steve-detail-secondary">
                          Validation requise avant ajout définitif à l’agenda.
                        </span>
                        <Link className="steve-btn-secondary" href="/agenda">
                          Vérifier dans l’agenda
                        </Link>
                      </>
                    ) : (
                      <>
                        <span className="steve-detail-primary">
                          {item.document.fileName}
                        </span>
                        <span className="steve-detail-secondary">
                          Pièce jointe reçue (non vérifiée), prête pour le coffre.
                        </span>
                        <Link className="steve-btn-secondary" href="/vault">
                          Voir dans Mes documents
                        </Link>
                      </>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="steve-btn-action"
          aria-expanded={sendOpen}
          onClick={() => {
            setSendOpen((open) => !open);
            setAuthorized(false);
            setSendStatus(null);
          }}
        >
          <span className="steve-icon-circle" aria-hidden="true">
            <UploadIcon />
          </span>
          <span>Envoyer un document</span>
        </button>

        {sendOpen ? (
          <form
            className="inbox-send-form"
            onSubmit={(event) => {
              void handleSendDocument(event);
            }}
          >
            <div className="steve-field-group">
              <label className="steve-field-label" htmlFor="inbox-recipient">
                Adresse du cabinet
              </label>
              <input
                id="inbox-recipient"
                className="steve-input"
                type="email"
                value={recipient}
                onChange={(event) => {
                  setRecipient(event.target.value);
                  setAuthorized(false);
                }}
              />
            </div>
            <div className="steve-field-group">
              <label className="steve-field-label" htmlFor="inbox-subject">
                Objet
              </label>
              <input
                id="inbox-subject"
                className="steve-input"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <label className="inbox-checkbox-row">
              <input
                type="checkbox"
                checked={authorized}
                onChange={(event) => setAuthorized(event.target.checked)}
              />
              <span>J’autorise Steve à envoyer ce document au cabinet indiqué.</span>
            </label>
            <button type="submit" className="steve-btn-primary" disabled={sending}>
              {sending ? "Envoi…" : "Confirmer l’envoi"}
            </button>
          </form>
        ) : null}

        {sendStatus === null ? null : (
          <p
            className={sendStatus.kind === "error" ? "steve-alert" : "steve-status"}
            role={sendStatus.kind === "error" ? "alert" : "status"}
          >
            {sendStatus.text}
          </p>
        )}
      </section>
    </FeatureShell>
  );
}
