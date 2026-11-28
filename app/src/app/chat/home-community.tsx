"use client";

import Link from "next/link";
import { useState } from "react";
import { askAvatarSrc } from "../../chat/faces";
import { demoSleepNights, demoFriend } from "../../community/demo";
import { detectSleepDrop, hoursLabel } from "../../community/sleep-signal";
import { challengeById, multiplierLabel, useCommunity } from "../../community/store";
import { Avatars, Eyebrow, TrophyIcon, WatchIcon } from "../challenges/community-ui";
import "./home-community.css";

export const sleepDiscussPrompt =
  "Stevie m’a fait remarquer que je dors moins bien depuis une dizaine de jours. On peut en parler ?";

export function HomeSignalCard(props: { readonly onDiscuss: () => void }) {
  const [state, setState] = useState<"open" | "fine" | "hidden">("open");
  const signal = detectSleepDrop(demoSleepNights);
  if (signal === null || state === "hidden") return null;
  const nights = demoSleepNights.slice(-(signal.days + 4));
  const max = Math.max(...nights.map((night) => night.minutes));
  const threshold = signal.baselineMinutes - 60;

  return (
    <section className="chat-home-card home-signal" aria-labelledby="home-signal-title">
      <Eyebrow>
        <WatchIcon />
        Ton sommeil · {nights.length} nuits
      </Eyebrow>
      <div className="home-signal-bars" aria-hidden="true">
        {nights.map((night) => (
          <span
            key={night.date}
            className={night.minutes <= threshold ? "home-signal-low" : undefined}
            style={{ height: `${Math.round((night.minutes / max) * 100)}%` }}
          />
        ))}
      </div>
      <p className="home-signal-legend">
        <span>{hoursLabel(signal.baselineMinutes)} d’habitude</span>
        <span>
          {hoursLabel(signal.recentMinutes)} depuis {signal.days} jours
        </span>
      </p>
      <div className="home-signal-who">
        <img src={askAvatarSrc} alt="" width={36} height={36} />
        <p id="home-signal-title" className="home-signal-bubble">
          {state === "fine"
            ? "Tant mieux. Je garde un œil dessus, sans te déranger."
            : `Tu dors moins bien depuis ${signal.days} jours. Ça va ?`}
        </p>
      </div>
      {state === "fine" ? (
        <button type="button" className="home-signal-btn home-signal-ghost" onClick={() => setState("hidden")}>
          Fermer
        </button>
      ) : (
        <div className="home-signal-actions">
          <button type="button" className="home-signal-btn home-signal-ghost" onClick={() => setState("fine")}>
            Ça va, merci
          </button>
          <button type="button" className="home-signal-btn home-signal-primary" onClick={props.onDiscuss}>
            On en parle
          </button>
        </div>
      )}
    </section>
  );
}

export function HomeChallengeCard() {
  const state = useCommunity();
  const membership = state.joined[0];
  const challenge = challengeById(membership?.challengeId ?? "sleep-7x7", state);
  if (challenge === undefined) return null;

  if (membership === undefined) {
    return (
      <Link className="chat-home-card home-challenge" href={`/challenges?join=${challenge.id}`}>
        <span className="home-challenge-top">
          <Eyebrow tone="orange">
            <TrophyIcon size={14} />
            Défi à deux
          </Eyebrow>
          <span className="home-challenge-mult">{multiplierLabel()} en équipe</span>
        </span>
        <span className="home-challenge-row">
          <span className="home-challenge-copy">
            <strong>{challenge.title}</strong>
            <span>
              {demoFriend.name} le fait aussi. Vous le faites ensemble ?
            </span>
          </span>
          <Avatars names={[demoFriend.name]} />
        </span>
      </Link>
    );
  }

  return (
    <Link className="chat-home-card home-challenge" href="/challenges">
      <span className="home-challenge-top">
        <Eyebrow tone="orange">
          <TrophyIcon size={14} />
          Défi en cours
        </Eyebrow>
        {membership.teammates.length > 0 ? (
          <span className="home-challenge-mult">{multiplierLabel()} en équipe</span>
        ) : null}
      </span>
      <span className="home-challenge-row">
        <span className="home-challenge-copy">
          <strong>{challenge.title}</strong>
          <span>
            Commence lundi
            {membership.teammates.length > 0 ? ` · avec ${membership.teammates.join(" et ")}` : ""}
          </span>
        </span>
        <Avatars names={["Moi", ...membership.teammates]} />
      </span>
    </Link>
  );
}
