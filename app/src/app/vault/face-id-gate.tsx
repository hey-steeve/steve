"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "./face-id.css";

export type FaceIdPhase = "locked" | "scanning" | "success" | "open";

export type FaceIdTimings = {
  readonly scanMs: number;
  readonly successMs: number;
};

export const defaultFaceIdTimings: FaceIdTimings = {
  scanMs: 1400,
  successMs: 750,
};

// Mocked Face ID: the scan always succeeds. It runs on every visit, and the
// Vault locks again when the app goes to the background.
export function FaceIdGate(props: {
  readonly timings?: FaceIdTimings;
  readonly children: (lock: () => void) => ReactNode;
}) {
  const timings = props.timings ?? defaultFaceIdTimings;
  const [phase, setPhase] = useState<FaceIdPhase>("locked");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timers.current.splice(0)) clearTimeout(timer);
  }, []);

  const lock = useCallback(() => {
    clearTimers();
    setPhase("locked");
  }, [clearTimers]);

  const unlock = useCallback(() => {
    clearTimers();
    setPhase("scanning");
    timers.current.push(
      setTimeout(() => setPhase("success"), timings.scanMs),
      setTimeout(() => setPhase("open"), timings.scanMs + timings.successMs),
    );
  }, [clearTimers, timings.scanMs, timings.successMs]);

  useEffect(() => {
    unlock();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") lock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimers();
    };
  }, [unlock, lock, clearTimers]);

  if (phase === "open") {
    return <div className="faceid-content">{props.children(lock)}</div>;
  }

  return (
    <section className="faceid-locked" aria-labelledby="faceid-title">
      <span className="faceid-lock-badge" aria-hidden="true">
        <LockGlyph />
      </span>
      <h2 id="faceid-title" className="faceid-title">
        Vault verrouillé
      </h2>
      <p className="faceid-copy">
        Tes documents sont protégés. Déverrouille avec Face ID pour y accéder.
      </p>
      <button
        type="button"
        className="steve-btn-primary"
        disabled={phase !== "locked"}
        onClick={unlock}
      >
        Déverrouiller avec Face ID
      </button>
      <p className="faceid-note">Face ID simulé pour la démo.</p>
      {phase === "locked" ? null : (
        <div className="faceid-layer">
          <div
            className="faceid-hud"
            data-phase={phase}
            role="status"
            aria-live="polite"
          >
            <FaceIdGlyph />
            <span>{phase === "success" ? "Déverrouillé" : "Face ID"}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function FaceIdGlyph() {
  return (
    <svg
      className="faceid-glyph"
      width="72"
      height="72"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g className="faceid-corners">
        <path d="M4 18v-8a6 6 0 0 1 6-6h8" />
        <path d="M46 4h8a6 6 0 0 1 6 6v8" />
        <path d="M60 46v8a6 6 0 0 1-6 6h-8" />
        <path d="M18 60h-8a6 6 0 0 1-6-6v-8" />
      </g>
      <g className="faceid-face">
        <path d="M22 23v5M42 23v5" />
        <path d="M32 23v12h-3" />
        <path d="M23 43c5 5 13 5 18 0" />
      </g>
      <path className="faceid-check" d="M19 33l9 9 17-19" pathLength={1} />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2.5" />
    </svg>
  );
}
