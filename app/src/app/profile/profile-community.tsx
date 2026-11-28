"use client";

import { useState } from "react";
import { demoHistory, demoStreakDays, referral } from "../../community/demo";
import { challengeById, recordInvite, updateCommunity, useCommunity } from "../../community/store";
import { Berry, Eyebrow, ShareIcon } from "../challenges/community-ui";
import "./profile-community.css";

export function ProfileChallenges() {
  const state = useCommunity();
  const done = demoHistory.length;
  return (
    <section className="steve-card" aria-labelledby="profile-challenges-title">
      <h2 id="profile-challenges-title" className="steve-card-title">Mes défis</h2>
      <ul className="profile-stats">
        <li>
          <strong>{done}</strong>
          <span>terminés</span>
        </li>
        <li>
          <strong>{demoStreakDays} j</strong>
          <span>de série</span>
        </li>
        <li>
          <strong>
            <Berry />
            {state.berries}
          </strong>
          <span>Berries</span>
        </li>
      </ul>
      <ul className="profile-challenge-list">
        {state.joined.map((membership) => {
          const challenge = challengeById(membership.challengeId, state);
          if (challenge === undefined) return null;
          const team = membership.teammates.length > 0 ? `avec ${membership.teammates.join(" et ")}` : "solo";
          return (
            <li key={membership.challengeId}>
              <span>
                {challenge.title} · {team}
              </span>
              <Eyebrow tone="orange">En cours</Eyebrow>
            </li>
          );
        })}
        {demoHistory.map((item) => (
          <li key={item.title}>
            <span>
              {item.title} · {item.team}
            </span>
            <span className="profile-earned">+{item.berries}</span>
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
    const text = `Je prends soin de ma santé avec Stevie. Rejoins-moi avec le code ${referral.code} : on gagne ${referral.berries} Berries chacun après ton premier défi.`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Stevie", text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      updateCommunity(recordInvite);
      setStatus("Invitation prête à envoyer.");
    } catch {
      setStatus("Partage annulé.");
    }
  }

  return (
    <section className="steve-card profile-invite" aria-labelledby="profile-invite-title">
      <h2 id="profile-invite-title" className="steve-card-title">Invite un proche</h2>
      <p className="steve-detail-secondary">
        Même s’il n’est pas chez Alan. Vous gagnez {referral.berries} Berries chacun après son premier défi.
      </p>
      <div className="profile-code">
        <span>{referral.code}</span>
        <button type="button" onClick={() => void share()}>
          <ShareIcon />
          Partager
        </button>
      </div>
      <p className="steve-detail-secondary">
        {invited} proches invités · {referral.joined} a déjà fini un défi
      </p>
      {status === null ? null : (
        <p className="steve-detail-secondary" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
