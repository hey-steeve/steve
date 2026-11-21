"use client";

import { useEffect, useRef, useState } from "react";
import { composerControl, type ComposerControl } from "../../chat/composer-control";
import type { ExchangeKind } from "../../chat/exchange";
import { headerAvatarSrc, heroSrc, replyAvatarSrc } from "../../chat/faces";
import { ChatMarkdown } from "../../chat/markdown";
import { newMessageId } from "../../chat/message-id";
import { chatRequestLimits, parseChatReply, toProviderMessages } from "../../chat/request";
import { useDictation } from "../../chat/speech";
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
const homeLeaveMs = 240;
const keyboardOpenGap = 120;
const nearBottomGap = 80;

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
  const conversation = useRef(0);
  const pageRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef(false);
  const [fieldGrown, setFieldGrown] = useState(false);
  draftRef.current = draft;

  const dictation = useDictation({
    getDraft: () => draftRef.current,
    onTranscript: setDraft,
  });
  const empty = messages.length === 0;
  const emptyRef = useRef(empty);
  const [homeMounted, setHomeMounted] = useState(true);
  emptyRef.current = empty;
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
    if (messages.length === 0) {
      return;
    }
    scrollThreadToBottom(threadRef.current);
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

  useEffect(() => {
    if (empty || !homeMounted) {
      return;
    }
    const hero = heroRef.current;
    const timer = window.setTimeout(() => {
      setHomeMounted(false);
    }, homeLeaveMs);
    const finish = (event: globalThis.AnimationEvent) => {
      if (
        event.target !== hero ||
        event.animationName !== "chat-home-out" ||
        emptyRef.current
      ) {
        return;
      }
      setHomeMounted(false);
    };
    hero?.addEventListener("animationend", finish);
    hero?.addEventListener("animationcancel", finish);
    return () => {
      window.clearTimeout(timer);
      hero?.removeEventListener("animationend", finish);
      hero?.removeEventListener("animationcancel", finish);
    };
  }, [empty, homeMounted]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const page = pageRef.current;
    if (viewport == null || page === null || !Number.isFinite(viewport.height)) {
      return;
    }
    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";

    let frame: number | null = null;
    let keyboardOpen = false;
    const apply = () => {
      frame = null;
      const thread = threadRef.current;
      const keepBottom = threadNearBottom(thread);
      const zoomed = Math.abs(viewport.scale - 1) >= 0.01;
      const unzoomedHeight = viewport.height * viewport.scale;
      const keyboardNow = window.innerHeight - unzoomedHeight > keyboardOpenGap;
      const keyboardOpened = keyboardNow && !keyboardOpen && !zoomed;
      keyboardOpen = keyboardNow;
      page.style.transform = "";
      page.style.top = `${viewport.offsetTop}px`;
      page.style.height = `${viewport.height}px`;
      page.toggleAttribute("data-keyboard-open", keyboardNow && !zoomed);
      if (keepBottom || keyboardOpened) {
        scrollThreadToBottom(thread);
      }
    };
    const pinWindow = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };
    const sync = () => {
      pinWindow();
      if (frame !== null) {
        return;
      }
      frame = window.requestAnimationFrame(apply);
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    window.addEventListener("scroll", pinWindow);
    page.addEventListener("focusin", pinWindow);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      window.removeEventListener("scroll", pinWindow);
      page.removeEventListener("focusin", pinWindow);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      page.style.top = "";
      page.style.height = "";
      page.style.transform = "";
      page.removeAttribute("data-keyboard-open");
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      html.style.overscrollBehavior = previous.htmlOverscroll;
      body.style.overscrollBehavior = previous.bodyOverscroll;
    };
  }, []);

  function send(text: string, restoreComposerFocus = true) {
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
    restoreFocus.current = messages.length === 0 && restoreComposerFocus;
    dictation.stop();
    const ticket = conversation.current;
    const history: readonly UiMessage[] = [
      ...messages,
      { id: newMessageId(), role: "user", content },
    ];
    setMessages(history);
    setDraft((current) => (current.trim() === content ? "" : current));
    setExchange("awaiting");
    void post(history, ticket);
  }

  function startOver() {
    conversation.current += 1;
    busy.current = false;
    dictation.stop();
    setMessages([]);
    setDraft("");
    setDemo(false);
    setExchange("idle");
    setHomeMounted(true);
  }

  async function post(history: readonly UiMessage[], ticket: number) {
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
      if (conversation.current !== ticket) {
        return;
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
      pushAgent(reply.reply);
      setExchange("rendering");
    } catch {
      if (conversation.current !== ticket) {
        return;
      }
      pushError(fallbackReply);
      setExchange("failed");
    } finally {
      if (conversation.current === ticket) {
        busy.current = false;
      }
    }
  }

  function pushAgent(content: string) {
    setMessages((current) => [
      ...current,
      { id: newMessageId(), role: "agent", content },
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
        placeholder="Demande n'importe quoi"
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
    <main
      ref={pageRef}
      className="chat-page"
    >
      <div className="chat-column">
        <header className="chat-header">
          {empty ? (
            <h1 className="chat-greeting">Bonjour,</h1>
          ) : (
            <button
              type="button"
              className="chat-back"
              aria-label="Retour"
              onClick={startOver}
            >
              <span className="chat-back-face">
                <BackIcon />
              </span>
            </button>
          )}
          {empty ? null : (
            <div className="chat-title">
              <img src={headerAvatarSrc} alt="" width={40} height={40} />
              <h1>Steve</h1>
            </div>
          )}
          {empty ? (
            <ProfileButton />
          ) : (
            <span className="chat-header-spacer" aria-hidden="true" />
          )}
          {empty || !demo ? null : (
            <p className="chat-badge">Mode démo : réponses simulées</p>
          )}
        </header>
        <div className="chat-scroll" ref={threadRef}>
          {homeMounted ? (
            <div
              ref={heroRef}
              className={empty ? "chat-hero" : "chat-hero chat-hero-leave"}
              aria-hidden={empty ? undefined : true}
              inert={empty ? undefined : true}
            >
              <img
                className="chat-hero-mascot"
                src={heroSrc}
                alt="Steve allongé qui fait des bulles"
                width={892}
                height={640}
              />
              <div className="chat-sheet">
                {empty ? (
                  <div className="chat-dock">
                    {composer}
                    {footnote}
                  </div>
                ) : null}
                <div className="chat-chips" role="group" aria-label="Suggestions">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="chat-chip"
                      onClick={() => {
                        send(suggestion, false);
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {empty ? null : (
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
                    </div>
                  </li>
                ),
              )}
              {exchange === "awaiting" ? (
                <li
                  className="chat-row chat-row-agent"
                  role="status"
                  aria-live="polite"
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
          <div className="chat-dock chat-dock-enter">
            {composer}
            {footnote}
          </div>
        )}
      </div>
    </main>
  );
}

function ComposerAction(props: {
  readonly control: ComposerControl;
  readonly pending: boolean;
  readonly onDictate: () => void;
  readonly onSend: () => void;
}) {
  const send = props.control.kind === "send";
  const listening = props.control.kind === "dictate" && props.control.listening;
  const supported = props.control.kind === "send" || props.control.supported;
  return (
    <button
      type="button"
      className={send ? "chat-action chat-action-send" : "chat-action"}
      aria-label={
        send ? "Envoyer" : listening ? "Arrêter la dictée" : "Dicter un message"
      }
      aria-pressed={send ? undefined : listening}
      disabled={send ? props.pending : !supported}
      onClick={send ? props.onSend : props.onDictate}
    >
      <ActionIcons />
    </button>
  );
}

function ActionIcons() {
  return (
    <>
      <span className="chat-action-icon chat-action-icon-mic" aria-hidden="true">
        <MicIcon />
      </span>
      <span className="chat-action-icon chat-action-icon-send" aria-hidden="true">
        <SendIcon />
      </span>
    </>
  );
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12l6.6-6.6z"
      />
    </svg>
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

function scrollThreadToBottom(thread: HTMLElement | null) {
  if (thread === null) {
    return;
  }
  thread.scrollTop = thread.scrollHeight;
}

function threadNearBottom(thread: HTMLElement | null): boolean {
  if (thread === null) {
    return false;
  }
  return thread.scrollHeight - thread.scrollTop - thread.clientHeight <= nearBottomGap;
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
