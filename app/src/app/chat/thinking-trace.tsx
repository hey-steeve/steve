import { useEffect, useId, useState } from "react";
import { steveFace } from "../../chat/faces";
import {
  elapsedLabel,
  traceSummary,
  type FinishedTrace,
  type TraceStep,
} from "../../chat/thinking-trace";
import "./thinking-trace.css";

export function LiveTrace(props: {
  readonly steps: readonly TraceStep[];
  readonly startedAt: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return (
    <div className="chat-trace chat-trace-live">
      <div className="chat-trace-head">
        <img src={steveFace.thinking} alt="" width={34} height={34} />
        <span>
          <span className="chat-trace-title">Stevie réfléchit…</span>
          <span className="chat-trace-time">{elapsedLabel(now - props.startedAt)}</span>
        </span>
      </div>
      <TraceSteps steps={props.steps} />
    </div>
  );
}

export function TraceSummary(props: { readonly trace: FinishedTrace }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className={open ? "chat-trace chat-trace-open" : "chat-trace-summary-wrap"}>
      <button
        type="button"
        className="chat-trace-summary"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="chat-trace-mini" aria-hidden="true">
          <CheckIcon />
        </span>
        <span>{traceSummary(props.trace)}</span>
        <span className="chat-trace-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
      <div id={panel} hidden={!open}>
        {open ? <TraceSteps steps={props.trace.steps} /> : null}
      </div>
    </div>
  );
}

function TraceSteps({ steps }: { readonly steps: readonly TraceStep[] }) {
  return (
    <ol className="chat-trace-steps">
      {steps.map((step) => (
        <li key={step.id} className={`chat-trace-step chat-trace-${step.status}`}>
          <span className="chat-trace-dot" aria-hidden="true">
            {step.status === "done" ? <CheckIcon /> : step.status === "failed" ? "!" : null}
          </span>
          <span className="chat-trace-copy">
            <span className="chat-trace-step-title">
              {step.title}
              {step.status === "doing" ? <span className="chat-trace-sr"> (en cours)</span> : null}
            </span>
            {step.detail === undefined ? null : (
              <span className="chat-trace-detail">{step.detail}</span>
            )}
            {step.tag === undefined ? null : <span className="chat-trace-tag">{step.tag}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
