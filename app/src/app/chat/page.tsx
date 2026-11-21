"use client";

import { useEffect, useRef, useState } from "react";
import { composerControl, type ComposerControl } from "../../chat/composer-control";
import type { ExchangeKind } from "../../chat/exchange";
import { headerAvatarSrc, heroSrc, replyAvatarSrc } from "../../chat/faces";
import { ChatMarkdown } from "../../chat/markdown";
import { newMessageId } from "../../chat/message-id";
import { chatRequestLimits, parseChatReply, toProviderMessages } from "../../chat/request";
import { useDictation, useSpeechPlayback } from "../../chat/speech";
import "./chat.css";

const suggestions = [
  "Prendre rendez-vous chez un généraliste",
  "Trouver une pharmacie de garde",
  "Me rappeler mon rendez-vous",
  "Préparer ma consultation",
] as const;

const disclaimer =
  "Steve n'est pas médecin et ne pose pas de diagnostic. En cas d'urgence, appelez le 15.";

const fallbackReply = "Je n'ai pas pu répondre. Réessayez.";
const clientTimeoutMs = 35_000;

type UiMessage =
  | {
      readonly id: string;
      readonly role: "user";
      readonly content: string;
    }
  | {
      readonly id: string;
      readonly role: "agent";
      readonly content: string;
      readonly model: string;
      readonly mocked: boolean;
    }
  | {
      readonly id: string;
      readonly role: "error";
      readonly content: string;
    };

export default function ChatPage() {
  const [messages, setMessages] = useState<readonly UiMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [exchange, setExchange] = useState<ExchangeKind>("idle");
  const [demo, setDemo] = useState(false);
  const draftRef = useRef(draft);
  const busy = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef(false);
  const [fieldGrown, setFieldGrown] = useState(false);
  draftRef.current = draft;

  const dictation = useDictation({
    getDraft: () => draftRef.current,
    onTranscript: setDraft,
  });
  const playback = useSpeechPlayback();
  const empty = messages.length === 0;
  const control = composerControl({
    draft,
    listening: dictation.listening,
    supported: dictation.supported,
  });

  useEffect(() => {
    if (exchange !== "rendering") {
      return;
    }
    const timer = window.setTimeout(() => {
      setExchange("settled");
    }, 700);
    return () => {
      window.clearTimeout(timer);
    };
  }, [exchange]);

  useEffect(() => {
    if (exchange !== "settled") {
      return;
    }
    const timer = window.setTimeout(() => {
      setExchange("idle");
    }, 1400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [exchange]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread === null || messages.length === 0) {
      return;
    }
    thread.scrollTop = thread.scrollHeight;
  }, [messages, exchange]);

  useEffect(() => {
    const field = fieldRef.current;
    if (field === null) {
      return;
    }
    const grown = resizeComposerField(field);
    setFieldGrown((current) => (current === grown ? current : grown));
  }, [draft]);

  useEffect(() => {
    if (!restoreFocus.current) {
      return;
    }
    restoreFocus.current = false;
    fieldRef.current?.focus();
  }, [messages]);

  function send(text: string) {
    const content = text.trim();
    if (
      content.length === 0 ||
      busy.current ||
      exchange === "awaiting" ||
      exchange === "rendering"
    ) {
      return;
    }
    busy.current = true;
    restoreFocus.current = messages.length === 0;
    dictation.stop();
    playback.stop();
    const history: readonly UiMessage[] = [
      ...messages,
      { id: newMessageId(), role: "user", content },
    ];
    setMessages(history);
    setDraft((current) => (current.trim() === content ? "" : current));
    setExchange("awaiting");
    void post(history);
  }

  async function post(history: readonly UiMessage[]) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: toProviderMessages(history),
        }),
        signal: AbortSignal.timeout(clientTimeoutMs),
      });
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        pushError(errorText(payload));
        setExchange("failed");
        return;
      }
      const reply = parseChatReply(payload);
      if (reply.kind === "invalid") {
        pushError(fallbackReply);
        setExchange("failed");
        return;
      }
      setDemo(reply.mocked);
      pushAgent(reply.reply, reply.model, reply.mocked);
      setExchange("rendering");
    } catch {
      pushError(fallbackReply);
      setExchange("failed");
    } finally {
      busy.current = false;
    }
  }

  function pushAgent(content: string, model: string, mocked: boolean) {
    setMessages((current) => [
      ...current,
      { id: newMessageId(), role: "agent", content, model, mocked },
    ]);
  }

  function pushError(content: string) {
    setMessages((current) => [
      ...current,
      { id: newMessageId(), role: "error", content },
    ]);
  }

  const composer = (
    <div className={fieldGrown ? "chat-composer chat-composer-grown" : "chat-composer"}>
      <button
        type="button"
        className="chat-plus"
        aria-label="Ajouter une pièce jointe"
        disabled
      >
        +
      </button>
      <textarea
        ref={fieldRef}
        className="chat-field"
        value={draft}
        rows={1}
        maxLength={chatRequestLimits.maxMessageChars}
        placeholder="Demande n'importe quoi à Steve"
        aria-label="Message pour Steve"
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            send(draft);
          }
        }}
      />
      <ComposerAction
        control={control}
        pending={exchange === "awaiting"}
        onDictate={dictation.toggle}
        onSend={() => {
          send(draft);
        }}
      />
    </div>
  );

  const footnote = (
    <>
      <p className="chat-disclaimer">{disclaimer}</p>
      {dictation.notice === null ? null : (
        <p className="chat-notice">{dictation.notice}</p>
      )}
    </>
  );

  return (
    <main className="chat-page">
      <header className="chat-header">
        {empty ? null : (
          <div className="chat-title">
            <img src={headerAvatarSrc} alt="" width={28} height={28} />
            <h1>Steve</h1>
          </div>
        )}
        <ProfileButton />
        {empty || !demo ? null : (
          <p className="chat-badge">Mode démo : réponses simulées</p>
        )}
      </header>
      <div className="chat-scroll" ref={threadRef}>
        {empty ? (
        <div className="chat-hero">
          <img
            className="chat-hero-mascot"
            src={heroSrc}
            alt="Steve"
            width={514}
            height={640}
          />
          <div className="chat-dock">
            {composer}
            {footnote}
          </div>
          <div className="chat-chips" role="group" aria-label="Suggestions">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="chat-chip"
                onClick={() => {
                  send(suggestion);
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : (
          <ol className="chat-thread" aria-live="polite">
            {messages.map((message) =>
              message.role === "user" ? (
                <li key={message.id} className="chat-row chat-row-user">
                  <div className="chat-user">{message.content}</div>
                  <UserAvatar />
                </li>
              ) : message.role === "error" ? (
                <li key={message.id} className="chat-row chat-row-agent">
                  <SteveAvatar />
                  <div className="chat-error" role="alert">
                    {message.content}
                  </div>
                </li>
              ) : (
                <li key={message.id} className="chat-row chat-row-agent">
                  <SteveAvatar />
                  <div className="chat-agent">
                    <div className="chat-agent-text">
                      <ChatMarkdown text={message.content} />
                    </div>
                    {message.mocked || message.model === "mock" ? null : (
                      <p className="chat-model">{message.model}</p>
                    )}
                    {playback.supported ? (
                      <button
                        type="button"
                        className="chat-speak"
                        aria-label={
                          playback.activeId === message.id
                            ? "Arrêter la lecture"
                            : "Lire la réponse"
                        }
                        aria-pressed={playback.activeId === message.id}
                        onClick={() => {
                          playback.toggle(message.id, message.content);
                        }}
                      >
                        <SpeakerIcon />
                      </button>
                    ) : null}
                  </div>
                </li>
              ),
            )}
            {exchange === "awaiting" ? (
              <li
                className="chat-row chat-row-agent"
                role="status"
                aria-label="Steve écrit"
              >
                <SteveAvatar />
                <div className="chat-typing">
                  <span className="chat-dot" />
                  <span className="chat-dot" />
                  <span className="chat-dot" />
                </div>
              </li>
            ) : null}
          </ol>
      )}
      </div>
      {empty ? null : (
        <div className="chat-dock">
          {composer}
          {footnote}
        </div>
      )}
    </main>
  );
}

function ComposerAction(props: {
  readonly control: ComposerControl;
  readonly pending: boolean;
  readonly onDictate: () => void;
  readonly onSend: () => void;
}) {
  if (props.control.kind === "send") {
    return (
      <button
        type="button"
        className="chat-action"
        aria-label="Envoyer"
        disabled={props.pending}
        onClick={props.onSend}
      >
        <SendIcon />
      </button>
    );
  }
  return (
    <button
      type="button"
      className="chat-action"
      aria-label={props.control.listening ? "Arrêter la dictée" : "Dicter un message"}
      aria-pressed={props.control.listening}
      disabled={!props.control.supported}
      onClick={props.onDictate}
    >
      <MicIcon />
    </button>
  );
}

function ProfileButton() {
  return (
    <button type="button" className="chat-profile" aria-label="Profil">
      <span className="chat-profile-face">
        <ProfileIcon />
      </span>
    </button>
  );
}

function SteveAvatar() {
  return (
    <span className="chat-avatar chat-avatar-agent" aria-hidden="true">
      <img src={replyAvatarSrc} alt="" width={32} height={32} />
    </span>
  );
}

function UserAvatar() {
  return (
    <span className="chat-avatar chat-avatar-user" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path
          fill="currentColor"
          d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-6 1.8-6 4v1h12v-1c0-2.2-2.7-4-6-4z"
        />
      </svg>
    </span>
  );
}

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-6 1.8-6 4v1h12v-1c0-2.2-2.7-4-6-4z"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 4.2 5.2 11l1.4 1.4L11 8.1V20h2V8.1l4.4 4.3L18.8 11 12 4.2z"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
      />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 9v6h4l5 4V5L8 9H4zm11.5 3a3.5 3.5 0 0 0-1.5-2.9v5.8a3.5 3.5 0 0 0 1.5-2.9z"
      />
    </svg>
  );
}

function resizeComposerField(field: HTMLTextAreaElement): boolean {
  field.style.height = "auto";
  const style = getComputedStyle(field);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    return false;
  }
  const padding =
    Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  const border =
    Number.parseFloat(style.borderTopWidth) +
    Number.parseFloat(style.borderBottomWidth);
  const limit = lineHeight * 5 + padding + border;
  const needed = field.scrollHeight;
  field.style.height = `${Math.min(needed, limit)}px`;
  field.style.overflowY = needed > limit ? "auto" : "hidden";
  return needed > lineHeight + padding + border + 1;
}

function errorText(body: unknown): string {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return fallbackReply;
  }
  const error: unknown = Reflect.get(body, "error");
  if (typeof error !== "string" || error.length === 0) {
    return fallbackReply;
  }
  return error;
}
