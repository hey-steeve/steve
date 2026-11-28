"use client";

import type { LiveCall } from "../../voice/use-live-call";

export function AgentCallBar({
  call,
  showTranscript,
  onToggleTranscript,
  onRetry,
}: {
  readonly call: LiveCall;
  readonly showTranscript: boolean;
  readonly onToggleTranscript: () => void;
  readonly onRetry?: () => void;
}) {
  if (call.phase === "idle") return null;
  if (call.phase === "ended") {
    if (call.endReason === "failed" || call.endReason === "connection-lost") {
      return (
        <div className="chat-call-error">
          <img
            className="chat-call-error-mascot"
            src="/mascot/state-listening.webp"
            alt=""
            width={64}
            height={64}
          />
          <p className="chat-notice" role="status">The call was cut off. Try again.</p>
          {onRetry === undefined ? null : (
            <button type="button" className="chat-call-retry" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      );
    }
    return null;
  }

  const active = call.phase === "active";
  // Mock session: no voice backend. Say so instead of pretending Stevie listens.
  const demo = active && call.mock;
  const live = active && !call.mock;
  const title = demo ? "Demo mode" : active ? "Stevie is on the line" : "Connecting…";
  const activityLabel = demo
    ? "Voice off"
    : call.activity === "speaking"
      ? "Stevie is speaking"
      : call.muted ? "Mic muted" : "Stevie is listening";
  return (
    <div className="chat-call-bar" role="group" aria-label="Call with Stevie">
      <img className="chat-call-bar-avatar" src="/demo/steve-call-avatar.webp" alt="" width={40} height={40} />
      <span className="chat-call-bar-copy" role="status">
        <span className="chat-call-bar-title">
          {title}
        </span>
        {active ? <span className="chat-call-bar-subtitle">{activityLabel}</span> : null}
      </span>
      {live && call.activity ? (
        <span className="chat-call-wave" data-activity={call.activity} aria-hidden="true">
          <span /><span /><span />
        </span>
      ) : null}
      <div className="chat-call-controls">
        <button
          type="button"
          className="chat-call-control"
          aria-label="Mute mic"
          title={call.muted ? "Unmute mic" : "Mute mic"}
          aria-pressed={call.muted}
          disabled={!live}
          onClick={() => call.setMuted(!call.muted)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            {call.muted ? <path d="M3 3l18 18" /> : null}
          </svg>
        </button>
        <button
          type="button"
          className="chat-call-control"
          aria-label="Show transcript"
          title={showTranscript ? "Hide transcript" : "Show transcript"}
          aria-pressed={showTranscript}
          onClick={onToggleTranscript}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 4H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3v3l4-3h9a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM7 9h10M7 14h7" />
          </svg>
        </button>
        <button
          type="button"
          className="chat-call-end"
          aria-label="End call"
          title="End call"
          onClick={() => call.end("hang-up")}
        >
          <PhoneIcon />
        </button>
      </div>
    </div>
  );
}

export function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1.1-.24 11.4 11.4 0 0 0 3.5.56 1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1A17 17 0 0 1 3 5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .56 3.5 1 1 0 0 1-.25 1.1z"
      />
    </svg>
  );
}
