"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import "./tab-bar.css";

export const appTabs = [
  { href: "/chat", label: "Accueil" },
  { href: "/agenda", label: "Agenda" },
  { href: "/vault", label: "Documents" },
  { href: "/profile", label: "Mon profil" },
] as const;

// Module state survives client-side navigation, so a freshly mounted bar can
// start its indicator on the tab the user just left and slide to the new one.
let lastTab: number | null = null;

export function tabIndexFor(current: string): number | null {
  const index = appTabs.findIndex((tab) => tab.href === current);
  return index < 0 ? null : index;
}

export function AppTabBar(props: {
  readonly current: string;
  readonly floating?: boolean;
  readonly onCall?: () => void;
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
      <nav className="app-tabs" aria-label="Espaces Steve">
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
      {props.onCall === undefined ? (
        <Link className="app-tab-fab" href="/chat" aria-label="Parler à Steve" title="Parler à Steve">
          <ChatIcon />
        </Link>
      ) : (
        <button
          type="button"
          className="app-tab-fab chat-call-cta"
          aria-label="Appeler Steve"
          title="Appeler Steve"
          onClick={props.onCall}
        >
          <PhoneIcon />
        </button>
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
  <Svg key="agenda">
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>,
  <Svg key="vault">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>,
  <Svg key="profile">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>,
];

function PhoneIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1.1-.24 11.4 11.4 0 0 0 3.5.56 1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1A17 17 0 0 1 3 5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .56 3.5 1 1 0 0 1-.25 1.1z"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}
