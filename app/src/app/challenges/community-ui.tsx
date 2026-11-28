import type { ReactNode } from "react";
import type { Partner, Reward } from "../../community/demo";
import { alanAppStoreUrl, plans, planLabels, setPlan, type Plan } from "../../community/plan";
import "./community-ui.css";

export function Berry() {
  return <span className="community-berry" aria-hidden="true" />;
}

export function BerriesPill(props: {
  readonly count: number;
  readonly tone?: "glass" | "light";
  readonly locked?: boolean;
}) {
  const locked = props.locked === true;
  return (
    <span
      className={`community-berries community-berries-${props.tone ?? "light"}`}
      data-locked={locked ? "" : undefined}
      aria-label={locked ? "Berries, for Alan members only" : `${props.count} Berries`}
    >
      {locked ? <SmallLockIcon /> : <Berry />}
      {locked ? "Berries" : props.count}
    </span>
  );
}

export function SmallLockIcon(props: { readonly size?: number }) {
  const size = props.size ?? 13;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// Grey "With Alan" tag on anything a free account cannot use yet.
export function PremiumTag() {
  return (
    <span className="community-premium-tag">
      <SmallLockIcon size={11} />
      With Alan
    </span>
  );
}

export function AlanLogo(props: { readonly size?: number }) {
  const size = props.size ?? 36;
  return (
    <img className="community-alan-logo" src="/brand/alan-logo.webp" alt="" width={size} height={size} />
  );
}

// Small bar that sends the person to the Alan app, where Berries are spent.
export function AlanAppBar(props: { readonly plan: Plan; readonly berries: number }) {
  const member = props.plan === "alan";
  return (
    <a className="community-alan-bar" href={alanAppStoreUrl} target="_blank" rel="noreferrer">
      <AlanLogo />
      <span className="community-alan-copy">
        <strong>{member ? `${props.berries} Berries to spend` : "Unlock your Berries"}</strong>
        <span>{member ? "Your rewards are waiting in the Alan app" : "Join Alan to earn and spend them"}</span>
      </span>
      <span className="community-alan-cta">{member ? "Open" : "Download"}</span>
    </a>
  );
}

export function RewardList(props: { readonly rewards: readonly Reward[]; readonly berries: number; readonly locked: boolean }) {
  return (
    <ul className="community-rewards" data-locked={props.locked ? "" : undefined}>
      {props.rewards.map((reward) => {
        const ready = !props.locked && props.berries >= reward.cost;
        const progress = props.locked ? 0 : Math.min(1, props.berries / reward.cost);
        return (
          <li key={reward.id} className="community-reward">
            <span className={`community-partner community-partner-${props.locked ? "grey" : reward.tone}`} aria-hidden="true">
              {props.locked ? <SmallLockIcon size={18} /> : <Berry />}
            </span>
            <span className="community-reward-copy">
              <strong>{reward.title}</strong>
              <span>{reward.partner}</span>
              <span className="community-reward-track" aria-hidden="true">
                <i style={{ width: `${Math.round(progress * 100)}%` }} />
              </span>
            </span>
            <span className="community-reward-cost" data-ready={ready ? "" : undefined}>
              {ready ? "Ready" : `${reward.cost}`}
              {ready ? null : <Berry />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Demo switch between the two profiles.
export function PlanSwitch(props: { readonly plan: Plan }) {
  return (
    <div className="community-plan-switch" role="radiogroup" aria-label="Demo profile">
      {plans.map((plan) => (
        <button
          key={plan}
          type="button"
          role="radio"
          aria-checked={props.plan === plan}
          onClick={() => setPlan(plan)}
        >
          {plan === "alan" ? <AlanLogo size={20} /> : null}
          {planLabels[plan]}
        </button>
      ))}
    </div>
  );
}

export function Avatars(props: { readonly names: readonly string[] }) {
  return (
    <span className="community-avatars" aria-label={props.names.join(", ")}>
      {props.names.map((name, index) => (
        <span key={name} className={`community-avatar community-tone-${index % 3}`} aria-hidden="true">
          {name.charAt(0).toUpperCase()}
        </span>
      ))}
    </span>
  );
}

export function PartnerLogo(props: { readonly partner: Partner }) {
  return (
    <span className={`community-partner community-partner-${props.partner.tone}`} aria-hidden="true">
      {props.partner.initials}
    </span>
  );
}

export function Eyebrow(props: { readonly tone?: "indigo" | "orange" | "teal"; readonly children: ReactNode }) {
  return <span className={`community-eyebrow community-eyebrow-${props.tone ?? "indigo"}`}>{props.children}</span>;
}

export function TrophyIcon(props: { readonly size?: number }) {
  const size = props.size ?? 16;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}

export function TeamIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" />
    </svg>
  );
}

export function WatchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="3" />
      <path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}
