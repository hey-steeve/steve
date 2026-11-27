import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { headerAvatarSrc } from "../../chat/faces";
import {
  appointmentDay,
  appointmentTime,
  countdownLabel,
  daysUntil,
  homeAccountLinks,
  homeDemoNow,
  homeNextAppointment,
  homeNotifications,
  homeSpace,
  homeUpcoming,
} from "../../chat/home-summary";
import "./home-view.css";

type TopPanel = "notifications" | "account";

export function HomeTopBar(props: { readonly firstName?: string | undefined }) {
  const [panel, setPanel] = useState<TopPanel | null>(null);
  const [unread, setUnread] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (panel === null) {
      return;
    }
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  function toggle(next: TopPanel, opener: HTMLButtonElement) {
    openerRef.current = opener;
    setPanel((current) => (current === next ? null : next));
    if (next === "notifications") {
      setUnread(false);
    }
  }

  function close() {
    setPanel(null);
    openerRef.current?.focus();
  }

  const name = props.firstName?.trim() ?? "";
  return (
    <>
      <span className="chat-home-logo">
        <img src={headerAvatarSrc} alt="Steve" width={44} height={44} />
      </span>
      <span className="chat-home-glass-row">
        <button
          type="button"
          className="chat-home-glass"
          aria-label={unread ? "Notifications, 3 nouvelles" : "Notifications"}
          aria-haspopup="dialog"
          aria-expanded={panel === "notifications"}
          aria-controls="chat-home-notifications"
          onClick={(event) => toggle("notifications", event.currentTarget)}
        >
          <BellIcon />
          {unread ? <span className="chat-home-glass-dot" aria-hidden="true" /> : null}
        </button>
        <button
          type="button"
          className="chat-home-glass"
          aria-label="Mon compte"
          aria-haspopup="dialog"
          aria-expanded={panel === "account"}
          aria-controls="chat-home-account"
          onClick={(event) => toggle("account", event.currentTarget)}
        >
          <UserIcon />
        </button>
      </span>
      {panel === null ? null : (
        <>
          <button
            type="button"
            className="chat-home-pop-backdrop"
            aria-label="Fermer"
            tabIndex={-1}
            onClick={close}
          />
          {panel === "notifications" ? (
            <div
              ref={panelRef}
              id="chat-home-notifications"
              className="chat-home-pop chat-home-notifications"
              role="dialog"
              aria-label="Notifications"
            >
              <p className="chat-home-pop-title">Notifications</p>
              <ul>
                {homeNotifications.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="chat-home-notif">
                      <span className={`chat-home-notif-app chat-home-notif-${item.tone}`} aria-hidden="true">
                        {item.tone === "indigo" ? <CalendarIcon /> : item.tone === "teal" ? <MailIcon /> : <BellIcon size={18} />}
                      </span>
                      <span className="chat-home-notif-copy">
                        <span className="chat-home-notif-meta">
                          <span>{item.app}</span>
                          <span>{item.when}</span>
                        </span>
                        <strong>{item.title}</strong>
                        <span>{item.body}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div
              ref={panelRef}
              id="chat-home-account"
              className="chat-home-pop chat-home-account"
              role="dialog"
              aria-label="Mon compte"
            >
              <div className="chat-home-account-head">
                <span className="chat-home-account-avatar" aria-hidden="true">
                  {name === "" ? "?" : name.charAt(0).toUpperCase()}
                </span>
                <span>
                  <strong>{name === "" ? "Mon compte" : name}</strong>
                  <span>Ton espace Steve</span>
                </span>
              </div>
              <ul>
                {homeAccountLinks.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="chat-home-account-link">
                      <span>
                        <strong>{item.label}</strong>
                        <span>{item.detail}</span>
                      </span>
                      <ChevronIcon />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}

export function HomeAppointmentCard() {
  const [hidden, setHidden] = useState(false);
  if (hidden) {
    return null;
  }
  const { practitioner, specialty, startsAt } = homeNextAppointment;
  return (
    <section className="chat-home-appt" aria-label="Prochain rendez-vous">
      <div className="chat-home-appt-main">
        <span className="chat-home-chip">
          <ClockIcon size={15} />
          {countdownLabel(daysUntil(homeDemoNow, startsAt))}
        </span>
        <button
          type="button"
          className="chat-home-appt-close"
          aria-label="Masquer le rendez-vous"
          onClick={() => setHidden(true)}
        >
          <CloseIcon />
        </button>
        <Link className="chat-home-appt-link" href="/agenda">
          <span className="chat-home-appt-copy">
            <span className="chat-home-appt-name">{practitioner}</span>
            <span className="chat-home-appt-spec">{specialty}</span>
          </span>
          <span className="chat-home-appt-map" aria-hidden="true">
            <span>
              <StethoscopeIcon />
            </span>
          </span>
        </Link>
      </div>
      <div className="chat-home-appt-foot">
        <span>
          <CalendarIcon />
          {appointmentDay(startsAt)}
        </span>
        <span>
          <ClockIcon size={20} />
          {appointmentTime(startsAt)}
        </span>
      </div>
    </section>
  );
}

export function HomeAskCard(props: {
  readonly disclaimer: ReactNode;
  readonly composer: ReactNode;
  readonly starters: ReactNode;
}) {
  return (
    <section className="chat-home-card chat-home-ask" aria-labelledby="chat-home-ask-title">
      <div className="chat-home-ask-head">
        <img src={headerAvatarSrc} alt="" width={36} height={36} />
        <span>
          <span id="chat-home-ask-title" className="chat-home-prompt-title">
            Comment puis-je t’aider ?
          </span>
          <span className="chat-home-prompt-copy">Écris-moi ici ou appelle-moi.</span>
        </span>
      </div>
      <div className="chat-dock chat-home-dock">
        {props.disclaimer}
        {props.composer}
      </div>
      {props.starters}
    </section>
  );
}

export function HomeSpaceCard() {
  const total = homeSpace.reduce((sum, item) => sum + item.count, 0);
  return (
    <section className="chat-home-card chat-home-space" aria-labelledby="chat-home-space-title">
      <div className="chat-home-card-head">
        <h2 id="chat-home-space-title">Mon espace santé</h2>
        <Link href="/vault">
          Tout voir
          <ChevronIcon />
        </Link>
      </div>
      <ul className="chat-home-stats">
        {homeSpace.map((item) => (
          <li key={item.href}>
            <Link href={item.href}>
              <strong>{item.count}</strong>
              <span>{item.count > 1 ? item.many : item.one}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="chat-home-bars" aria-hidden="true">
        {homeSpace.map((item) => (
          <i
            key={item.href}
            className={`chat-home-bar-${item.tone}`}
            style={{ flexGrow: item.count / total }}
          />
        ))}
      </div>
    </section>
  );
}

export function HomeUpcomingCard() {
  return (
    <section className="chat-home-card chat-home-upcoming" aria-labelledby="chat-home-upcoming-title">
      <h2 id="chat-home-upcoming-title" className="chat-home-section-title">
        À venir
      </h2>
      <ul>
        {homeUpcoming.map((item) => (
          <li key={item.href}>
            <Link href={item.href}>
              <span className={`chat-home-upcoming-icon chat-home-upcoming-${item.kind}`} aria-hidden="true">
                {item.kind === "reminder" ? <BellIcon size={20} /> : <MailIcon />}
              </span>
              <span className="chat-home-upcoming-copy">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </span>
              <span className="chat-home-upcoming-when">{item.when}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomeTiles() {
  return (
    <nav className="chat-home-tiles" aria-label="Raccourcis">
      <Link href="/directory" className="chat-home-tile">
        <span className="chat-home-tile-icon chat-home-tile-indigo" aria-hidden="true">
          <SearchIcon />
        </span>
        <strong>Annuaire</strong>
        <span>Trouver un praticien</span>
      </Link>
      <Link href="/booking" className="chat-home-tile">
        <span className="chat-home-tile-icon chat-home-tile-teal" aria-hidden="true">
          <CalendarIcon />
        </span>
        <strong>Rendez-vous</strong>
        <span>Steve appelle le cabinet</span>
      </Link>
    </nav>
  );
}

function Svg(props: { readonly size?: number | undefined; readonly children: ReactNode }) {
  const size = props.size ?? 22;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

function BellIcon({ size }: { readonly size?: number }) {
  return (
    <Svg size={size}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Svg>
  );
}

function UserIcon() {
  return (
    <Svg>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  );
}

function ClockIcon({ size }: { readonly size: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

function CalendarIcon() {
  return (
    <Svg>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg size={20}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

function StethoscopeIcon() {
  return (
    <Svg size={18}>
      <path d="M5 3v6a5 5 0 0 0 10 0V3" />
      <path d="M10 14v2a5 5 0 0 0 10 0v-3" />
      <circle cx="20" cy="11" r="2" />
    </Svg>
  );
}

function ChevronIcon() {
  return (
    <Svg size={14}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

function MailIcon() {
  return (
    <Svg size={20}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Svg>
  );
}

function SearchIcon() {
  return (
    <Svg size={20}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </Svg>
  );
}
