"use client";

import Link from "next/link";
import { useState } from "react";
import { askAvatarSrc } from "../../chat/faces";
import { demoSleepNights, demoFriend } from "../../community/demo";
import { detectSleepDrop, hoursLabel } from "../../community/sleep-signal";
import { isMember, usePlan } from "../../community/plan";
import { challengeById, multiplierLabel, useCommunity } from "../../community/store";
import { Avatars, Eyebrow, TrophyIcon, WatchIcon } from "../challenges/community-ui";
import "./home-community.css";

export const sleepDiscussPrompt =
  "Stevie noticed I’ve been sleeping worse for about ten days. Can we talk about it?";

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
        Your sleep · {nights.length} nights
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
        <span>{hoursLabel(signal.baselineMinutes)} usually</span>
        <span>
          {hoursLabel(signal.recentMinutes)} for {signal.days} days
        </span>
      </p>
      <div className="home-signal-who">
        <img src={askAvatarSrc} alt="" width={36} height={36} />
        <p id="home-signal-title" className="home-signal-bubble">
          {state === "fine"
            ? "Good to hear. I’ll keep an eye on it without bothering you."
            : `You’ve been sleeping worse for ${signal.days} days. Are you OK?`}
        </p>
      </div>
      {state === "fine" ? (
        <button type="button" className="home-signal-btn home-signal-ghost" onClick={() => setState("hidden")}>
          Close
        </button>
      ) : (
        <div className="home-signal-actions">
          <button type="button" className="home-signal-btn home-signal-ghost" onClick={() => setState("fine")}>
            I’m fine, thanks
          </button>
          <button type="button" className="home-signal-btn home-signal-primary" onClick={props.onDiscuss}>
            Let’s talk
          </button>
        </div>
      )}
    </section>
  );
}

export function HomeChallengeCard() {
  const state = useCommunity();
  const member = isMember(usePlan());
  const membership = state.joined[0];
  const challenge = challengeById(membership?.challengeId ?? "sleep-7x7", state);
  if (challenge === undefined) return null;

  if (membership === undefined) {
    return (
      <Link className="chat-home-card home-challenge" href={`/challenges?join=${challenge.id}`}>
        <span className="home-challenge-top">
          <Eyebrow tone="orange">
            <TrophyIcon size={14} />
            Challenge for two
          </Eyebrow>
          {member ? <span className="home-challenge-mult">{multiplierLabel()} as a team</span> : null}
        </span>
        <span className="home-challenge-row">
          <span className="home-challenge-copy">
            <strong>{challenge.title}</strong>
            <span>
              {demoFriend.name} is doing it too. Do it together?
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
          Ongoing challenge
        </Eyebrow>
        {member && membership.teammates.length > 0 ? (
          <span className="home-challenge-mult">{multiplierLabel()} as a team</span>
        ) : null}
      </span>
      <span className="home-challenge-row">
        <span className="home-challenge-copy">
          <strong>{challenge.title}</strong>
          <span>
            Starts Monday
            {membership.teammates.length > 0 ? ` · with ${membership.teammates.join(" and ")}` : ""}
          </span>
        </span>
        <Avatars names={["Me", ...membership.teammates]} />
      </span>
    </Link>
  );
}
