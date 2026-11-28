"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { headerAvatarSrc } from "../chat/faces";
import { appTabs, tabIndexFor } from "./tabs";
import "./tab-bar.css";

export { appTabs, tabIndexFor };

// Module state survives client-side navigation, so a freshly mounted bar can
// start its indicator on the tab the user just left and slide to the new one.
let lastTab: number | null = null;

export type StevieActions = {
  readonly onWrite: () => void;
  readonly onCall: () => void;
  readonly disclaimer: string;
};

export function AppTabBar(props: {
  readonly current: string;
  readonly floating?: boolean;
  readonly stevie?: StevieActions;
}) {
  const target = tabIndexFor(props.current);
  const [shown, setShown] = useState<number | null>(() => lastTab ?? target);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setShown(target);
    });
    lastTab = target;
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [target]);

  const indicator = shown ?? target ?? 0;
  return (
    <div className={props.floating === true ? "app-tabbar app-tabbar-floating" : "app-tabbar"}>
      <nav className="app-tabs" aria-label="Espaces Stevie">
        <span
          className="app-tab-indicator"
          data-hidden={shown === null ? "" : undefined}
          style={{ transform: `translateX(calc(${indicator} * var(--app-tab-step)))` }}
          aria-hidden="true"
        />
        {appTabs.map((tab, index) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            aria-current={index === target ? "page" : undefined}
            data-lit={index === shown ? "" : undefined}
            className="app-tab"
          >
            {tabIcons[index]}
          </Link>
        ))}
      </nav>
      {props.stevie === undefined ? (
        <Link className="app-tab-fab" href="/chat" aria-label="Parler à Stevie" title="Parler à Stevie">
          <StevieFace />
        </Link>
      ) : (
        <StevieLauncher {...props.stevie} />
      )}
    </div>
  );
}

function Svg({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const tabIcons = [
  <Svg key="home">
    <path d="M4 10.5 12 4l8 6.5V19a2 2 0 0 1-2 2h-3v-6H9v6H6a2 2 0 0 1-2-2z" />
  </Svg>,
  <Svg key="challenges">
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </Svg>,
  <Svg key="agenda">
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>,
  <Svg key="profile">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>,
];

function StevieFace() {
  return <img className="app-tab-fab-face" src={headerAvatarSrc} alt="" width={56} height={56} />;
}

// The round button at the end of the tab bar is Stevie. On the home it opens
// a small menu to write or call; elsewhere it links back to the home.
function StevieLauncher(props: StevieActions) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="app-tab-fab app-tab-stevie"
        aria-label="Parler à Stevie"
        title="Parler à Stevie"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="app-stevie-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <StevieFace />
        <span className="app-tab-fab-badge" aria-hidden="true">
          <ChatIcon size={13} />
        </span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="app-stevie-backdrop"
            aria-label="Fermer"
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <div ref={menuRef} id="app-stevie-menu" className="app-stevie-menu" role="dialog" aria-label="Parler à Stevie">
            <button type="button" className="chat-home-steve-item" onClick={() => run(props.onWrite)}>
              <span className="chat-home-steve-icon chat-home-steve-write" aria-hidden="true">
                <ChatIcon size={20} />
              </span>
              <span>
                <strong>Écrire à Stevie</strong>
                <span>Pose ta question par message</span>
              </span>
            </button>
            <button type="button" className="chat-home-steve-item chat-call-cta" onClick={() => run(props.onCall)}>
              <span className="chat-home-steve-icon chat-home-steve-call" aria-hidden="true">
                <PhoneIcon size={20} />
              </span>
              <span>
                <strong>Appeler Stevie</strong>
                <span>Il répond tout de suite</span>
              </span>
            </button>
            <p className="chat-home-steve-disclaimer">{props.disclaimer}</p>
          </div>
        </>
      ) : null}
    </>
  );
}

function PhoneIcon({ size = 26 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1.1-.24 11.4 11.4 0 0 0 3.5.56 1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1A17 17 0 0 1 3 5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .56 3.5 1 1 0 0 1-.25 1.1z"
      />
    </svg>
  );
}

function ChatIcon({ size = 26 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}
