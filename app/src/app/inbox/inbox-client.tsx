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
    subject: "Appointment confirmation",
    textBody: "Your appointment with Camille Lunéval is on 2 December at 10:00.",
    attachments: [],
    receivedAt: "2026-11-27T09:15:00Z",
  },
  {
    providerMessageId: "msg-demo-report-1",
    from: "secretariat.luneval@example.test",
    to: steveAddress,
    subject: "Document from the practice",
    textBody: "Please find your appointment letter attached.",
    attachments: [
      {
        id: "att-demo-1",
        fileName: "appointment-letter.pdf",
        mimeType: "application/pdf",
        bytes: new TextEncoder().encode("Appointment letter — 2 December at 10:00."),
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
      subject: "Appointment confirmation",
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
      subject: "Document from the practice",
      receivedAt: "2026-11-27T09:30:00Z",
    },
    document: {
      id: "att-demo-1",
      fileName: "appointment-letter.pdf",
      mimeType: "application/pdf",
      bytes: new TextEncoder().encode("Appointment letter — 2 December at 10:00."),
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
  const [subject, setSubject] = useState("Sending my appointment letter");
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
        text: "Confirm your consent before sending a document to a practitioner.",
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
        textBody: "Document sent from the Stevie inbox (demo data).",
        attachments: [
          {
            id: "att-out-1",
            fileName: "appointment-letter.pdf",
            mimeType: "application/pdf",
            bytes: new TextEncoder().encode("Appointment letter — demo data."),
          },
        ],
        authorization: { authorized: true },
      });
    } catch {
      setSendStatus({
        kind: "error",
        text: "Can’t send this document right now. Try again in a moment.",
      });
      return;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
    if (outcome.status !== "sent") {
      setSendStatus({
        kind: "error",
        text: "Can’t send this document. Check the recipient’s address.",
      });
      return;
    }
    setSendStatus({
      kind: "ok",
      text: `Simulated send to ${practitionerEmail} (ref. ${outcome.providerMessageId}). Nothing left the demo.`,
    });
    setSendOpen(false);
    setAuthorized(false);
  }

  return (
    <FeatureShell
      current="/inbox"
      title="My inbox"
      heroMascot={{ src: pageMascots.inbox, width: 600, height: 600 }}
    >
      <section className="steve-card" aria-labelledby="inbox-address-title">
        <h2 id="inbox-address-title" className="steve-card-title">
          Your Stevie address
        </h2>
        <div className="inbox-address-row">
          <MailIcon />
          <span className="inbox-address-text">{steveAddress}</span>
          <button
            type="button"
            className="inbox-copy-btn"
            aria-label="Copy the Stevie address"
            onClick={() => {
              void handleCopyAddress();
            }}
          >
            <CopyIcon />
          </button>
        </div>
        {copyState === "copied" ? (
          <p className="steve-status" role="status">
            Address copied: {steveAddress}
          </p>
        ) : null}
        {copyState === "failed" ? (
          <p className="steve-alert" role="alert">
            Copy failed. Select the address to copy it by hand.
          </p>
        ) : null}
      </section>

      <section className="steve-card" aria-labelledby="inbox-received-title">
        <h2 id="inbox-received-title" className="steve-card-title">
          Received
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
                        ? "Appointment confirmation"
                        : "Document from the practice"}
                    </span>
                    <span className={isConfirmation ? "steve-pill steve-pill-warning" : "steve-pill"}>
                      {isConfirmation ? "To check" : "Document received"}
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
                          {item.confirmation.practitionerName ?? "Practitioner"} · Ref.{" "}
                          {item.confirmation.reference}
                        </span>
                        <span className="steve-detail-secondary">
                          Needs your check before it goes into the calendar for good.
                        </span>
                        <Link className="steve-btn-secondary" href="/agenda">
                          Check in calendar
                        </Link>
                      </>
                    ) : (
                      <>
                        <span className="steve-detail-primary">
                          {item.document.fileName}
                        </span>
                        <span className="steve-detail-secondary">
                          Attachment received (not checked), ready for the vault.
                        </span>
                        <Link className="steve-btn-secondary" href="/vault">
                          See in the Vault
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
          <span>Send a document</span>
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
                Practice address
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
                Subject
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
              <span>I allow Stevie to send this document to this practice.</span>
            </label>
            <button type="submit" className="steve-btn-primary" disabled={sending}>
              {sending ? "Sending…" : "Confirm sending"}
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
