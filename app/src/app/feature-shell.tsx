import Link from "next/link";
import type { ReactNode } from "react";
import "./feature-shell.css";

export const steveDisclaimer =
  "Steve n’est pas médecin et ne pose pas de diagnostic.";

export const featureNavItems = [
  { href: "/chat", label: "Accueil" },
  { href: "/directory", label: "Annuaire" },
  { href: "/booking", label: "Rendez-vous" },
  { href: "/agenda", label: "Agenda" },
  { href: "/profile", label: "Mon profil" },
  { href: "/vault", label: "Documents" },
  { href: "/reminders", label: "Rappels" },
] as const;

export type FeatureRoute = (typeof featureNavItems)[number]["href"];

export function FeatureShell(props: {
  readonly current: FeatureRoute;
  readonly title: string;
  readonly subtitle?: string;
  readonly badge?: string;
  readonly headerMascot?: { readonly src: string; readonly width: number; readonly height: number };
  readonly heroMascot?: { readonly src: string; readonly width: number; readonly height: number };
  readonly children: ReactNode;
}) {
  return (
    <main className="steve-screen">
      <div className="steve-topbar">
        <Link className="steve-back" href="/chat">
          <BackChevronIcon />
          Retour
        </Link>
        {props.badge === undefined ? null : <span className="steve-pill">{props.badge}</span>}
      </div>
      <header className="steve-header-row">
        <div className="steve-header-copy">
          <h1 className="steve-title">{props.title}</h1>
          {props.subtitle === undefined ? null : <p className="steve-subtitle">{props.subtitle}</p>}
        </div>
        {props.headerMascot === undefined ? null : (
          <img className="steve-header-mascot" src={props.headerMascot.src} alt="" width={props.headerMascot.width} height={props.headerMascot.height} />
        )}
      </header>
      {props.heroMascot === undefined ? null : (
        <img className="steve-hero-mascot" src={props.heroMascot.src} alt="" width={props.heroMascot.width} height={props.heroMascot.height} />
      )}
      {props.children}
      <FeatureNav current={props.current} />
      <p className="steve-disclaimer">{steveDisclaimer}</p>
    </main>
  );
}

export function FeatureNav({ current }: { readonly current: FeatureRoute }) {
  return (
    <nav className="steve-nav" aria-label="Espaces Steve">
      {featureNavItems.map(({ href, label }) => (
        <Link key={href} href={href} className="steve-nav-link" aria-current={href === current ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Icon({ size = 20, strokeWidth = 1.8, children }: { readonly size?: number; readonly strokeWidth?: number; readonly children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const BackChevronIcon = () => <Icon size={18} strokeWidth={2.2}><path d="m15 18-6-6 6-6" /></Icon>;
export const ChevronRightIcon = () => <Icon size={18} strokeWidth={2}><path d="m9 6 6 6-6 6" /></Icon>;
export const CheckIcon = () => <Icon size={18} strokeWidth={2.2}><path d="M5 13l4 4L19 7" /></Icon>;
export const CalendarIcon = () => <Icon><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></Icon>;
export const PinIcon = () => <Icon><path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></Icon>;
export const UserIcon = () => <Icon><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></Icon>;
export const BellIcon = () => <Icon><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.3 20a2 2 0 0 0 3.4 0" /></Icon>;
export const MessageIcon = () => <Icon><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20l1.4-4.6A8.5 8.5 0 1 1 21 11.5Z" /><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" /></Icon>;
export const MailIcon = () => <Icon><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></Icon>;
export const DocumentIcon = () => <Icon><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Icon>;
export const SettingsIcon = () => <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></Icon>;
export const PhoneOutlineIcon = () => <Icon><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" /></Icon>;
export const UploadIcon = () => <Icon strokeWidth={2}><path d="M12 16V4m0 0-4 4m4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Icon>;
export const CopyIcon = () => <Icon size={18}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>;
export const EditIcon = () => <Icon size={18}><path d="m16.5 3.5 4 4L7 21H3v-4L16.5 3.5Z" /></Icon>;
export const InfoIcon = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 16v-4m0-4h.01" /></Icon>;
