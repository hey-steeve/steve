"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { headerAvatarSrc } from "../chat/faces";
import { appTabs, tabIndexFor } from "./tabs";
import "./tab-bar.css";

export { appTabs, tabIndexFor };

// Module state survives client-side navigation, so a freshly mounted bar can
// start its indicator on the tab the user just left and slide to the new one.
let lastTab: number | null = null;

export type StevieActions = {
  readonly onWrite: () => void;
};

export const writeHref = "/chat?ecrire=1";

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
      <nav className="app-tabs" aria-label="Stevie spaces">
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
        <Link className="app-tab-fab" href={writeHref} aria-label="Talk to Stevie" title="Talk to Stevie">
          <StevieFace />
          <span className="app-tab-fab-badge" aria-hidden="true">
            <ChatIcon size={13} />
          </span>
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
// the chat bar straight away; elsewhere it goes to the home with the chat bar
// open.
function StevieLauncher(props: StevieActions) {
  return (
    <button
      type="button"
      className="app-tab-fab app-tab-stevie"
      aria-label="Talk to Stevie"
      title="Talk to Stevie"
      onClick={props.onWrite}
    >
      <StevieFace />
      <span className="app-tab-fab-badge" aria-hidden="true">
        <ChatIcon size={13} />
      </span>
    </button>
  );
}

function ChatIcon({ size = 26 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}
