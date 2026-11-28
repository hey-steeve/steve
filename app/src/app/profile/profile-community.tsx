"use client";

import { useState } from "react";
import { demoHistory, demoStreakDays, referral } from "../../community/demo";
import { isMember, usePlan } from "../../community/plan";
import { challengeById, recordInvite, updateCommunity, useCommunity } from "../../community/store";
import { Berry, Eyebrow, ShareIcon, SmallLockIcon } from "../challenges/community-ui";
import "./profile-community.css";

export function ProfileChallenges() {
  const state = useCommunity();
  const member = isMember(usePlan());
  const done = demoHistory.length;
  return (
    <section className="steve-card" aria-labelledby="profile-challenges-title">
      <h2 id="profile-challenges-title" className="steve-card-title">My challenges</h2>
      <ul className="profile-stats">
        <li>
          <strong>{done}</strong>
          <span>completed</span>
        </li>
        <li>
          <strong>{demoStreakDays} d</strong>
          <span>streak</span>
        </li>
        <li data-locked={member ? undefined : ""}>
          <strong>
            {member ? <Berry /> : <SmallLockIcon size={16} />}
            {member ? state.berries : "—"}
          </strong>
          <span>{member ? "Berries" : "Berries with Alan"}</span>
        </li>
      </ul>
      <ul className="profile-challenge-list">
        {state.joined.map((membership) => {
          const challenge = challengeById(membership.challengeId, state);
          if (challenge === undefined) return null;
          const team = membership.teammates.length > 0 ? `with ${membership.teammates.join(" and ")}` : "solo";
          return (
            <li key={membership.challengeId}>
              <span>
                {challenge.title} · {team}
              </span>
              <Eyebrow tone="orange">Ongoing</Eyebrow>
            </li>
          );
        })}
        {demoHistory.map((item) => (
          <li key={item.title}>
            <span>
              {item.title} · {item.team}
            </span>
            <span className="profile-earned" data-locked={member ? undefined : ""}>
              +{item.berries}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProfileInvite() {
  const state = useCommunity();
  const [status, setStatus] = useState<string | null>(null);
  const invited = referral.invited + state.invited;

  async function share() {
    const text = `I look after my health with Stevie. Join me with code ${referral.code}: we each get ${referral.berries} Berries after your first challenge.`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Stevie", text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      updateCommunity(recordInvite);
      setStatus("Invite ready to send.");
    } catch {
      setStatus("Sharing cancelled.");
    }
  }

  return (
    <section className="steve-card profile-invite" aria-labelledby="profile-invite-title">
      <h2 id="profile-invite-title" className="steve-card-title">Invite someone close</h2>
      <p className="steve-detail-secondary">
        Even if they’re not with Alan. You each earn {referral.berries} Berries after their first challenge.
      </p>
      <div className="profile-code">
        <span>{referral.code}</span>
        <button type="button" onClick={() => void share()}>
          <ShareIcon />
          Share
        </button>
      </div>
      <p className="steve-detail-secondary">
        {invited} people invited · {referral.joined} already finished a challenge
      </p>
      {status === null ? null : (
        <p className="steve-detail-secondary" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
