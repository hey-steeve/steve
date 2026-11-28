"use client";

import { useEffect, useRef, useState } from "react";
import { askAvatarSrc, pageMascots } from "../../chat/faces";
import { demoChallenges, demoFriend, demoHistory, type Challenge } from "../../community/demo";
import {
  challengeById,
  challengeDay,
  challengeStatus,
  shortDate,
  startLabel,
  joinChallenge,
  leaveChallenge,
  multiplierLabel,
  resetCommunity,
  rewardFor,
  updateCommunity,
  useCommunity,
} from "../../community/store";
import { FeatureShell } from "../feature-shell";
import { FriendsSection } from "./friends-section";
import { Avatars, BerriesPill, Eyebrow, PartnerLogo, TeamIcon } from "./community-ui";
import "./challenges.css";

const foundTeam = ["Inès", "Marc"] as const;

type Choice = "friend" | "team" | "solo";

export function teammatesFor(choice: Choice, challenge: Challenge): readonly string[] {
  if (choice === "friend" && challenge.friend !== undefined) return [challenge.friend];
  if (choice === "team") return foundTeam;
  return [];
}

type Section = "mine" | "discover" | "friends";
type MineView = "ongoing" | "upcoming" | "history";

const sections: readonly Section[] = ["mine", "discover", "friends"];
const sectionLabels: Record<Section, string> = { mine: "Mes défis", discover: "Découvrir", friends: "Amis" };

export default function ChallengesClient() {
  const state = useCommunity();
  const [joining, setJoining] = useState<Challenge | null>(null);
  const [section, setSection] = useState<Section>("mine");
  const [view, setView] = useState<MineView>("ongoing");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("section") === "amis") setSection("friends");
    const id = params.get("join");
    const challenge = id === null ? undefined : challengeById(id);
    if (challenge !== undefined) {
      setSection("discover");
      setJoining(challenge);
    }
  }, []);

  const mine = state.joined.flatMap((membership) => {
    const challenge = challengeById(membership.challengeId);
    return challenge === undefined ? [] : [{ challenge, teammates: membership.teammates }];
  });
  const ongoing = mine.filter((item) => challengeStatus(item.challenge) === "ongoing");
  const upcoming = mine.filter((item) => challengeStatus(item.challenge) === "upcoming");
  const open = demoChallenges.filter(
    (challenge) =>
      challengeStatus(challenge) !== "done" && !state.joined.some((item) => item.challengeId === challenge.id),
  );
  const counts: Record<MineView, number> = {
    ongoing: ongoing.length,
    upcoming: upcoming.length,
    history: demoHistory.length,
  };

  function close() {
    // After joining, land on the list that now holds the new challenge.
    const joined = joining === null ? undefined : state.joined.find((item) => item.challengeId === joining.id);
    if (joining !== null && joined !== undefined) {
      setSection("mine");
      setView(challengeStatus(joining) === "upcoming" ? "upcoming" : "ongoing");
    }
    setJoining(null);
  }

  return (
    <FeatureShell
      current="/challenges"
      title="Défis"
      subtitle="Prends soin de toi, mais pas tout seul."
      heroMascot={{ src: pageMascots.challenges, width: 600, height: 600 }}
    >
      <div className="challenges-bar">
        <div className="challenges-segments" role="tablist" aria-label="Défis">
          {sections.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={section === item}
              className="challenges-segment"
              onClick={() => setSection(item)}
            >
              {sectionLabels[item]}
            </button>
          ))}
        </div>
        <BerriesPill count={state.berries} />
      </div>

      {section === "mine" ? (
        <>
          <div className="challenges-chips" role="tablist" aria-label="Mes défis">
            {(["ongoing", "upcoming", "history"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={view === item}
                className="challenges-chip"
                onClick={() => setView(item)}
              >
                {mineLabels[item]}
                <span className="challenges-chip-count">{counts[item]}</span>
              </button>
            ))}
          </div>

          {view === "history" ? (
            <section className="steve-card" aria-label="Historique">
              <ul className="challenges-history">
                {demoHistory.map((item) => (
                  <li key={item.title}>
                    <span className="challenges-history-check" aria-hidden="true">
                      ✓
                    </span>
                    <span className="challenges-item-copy">
                      <span className="steve-detail-primary">{item.title}</span>
                      <span className="steve-detail-secondary">
                        Terminé le {shortDate(item.endedOn)} · {item.days} jours · {item.team}
                      </span>
                    </span>
                    <span className="challenges-earned">+{item.berries}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (view === "ongoing" ? ongoing : upcoming).length === 0 ? (
            <section className="steve-card challenges-empty">
              <p className="steve-detail-secondary">
                {view === "ongoing" ? "Aucun défi en cours pour le moment." : "Aucun défi à venir."}
              </p>
              <button type="button" className="challenges-team-btn challenges-find" onClick={() => setSection("discover")}>
                Trouver un défi
              </button>
            </section>
          ) : (
            (view === "ongoing" ? ongoing : upcoming).map(({ challenge, teammates }) => (
              <ActiveChallenge key={challenge.id} challenge={challenge} teammates={teammates} />
            ))
          )}
        </>
      ) : section === "friends" ? (
        <FriendsSection onJoin={setJoining} />
      ) : (
        <>
          <section className="steve-card challenges-team" aria-labelledby="challenges-team-title">
            <div className="challenges-row">
              <TeamIcon />
              <h2 id="challenges-team-title" className="steve-card-title">Pas d’équipe ?</h2>
            </div>
            <p className="challenges-team-copy">Stevie trouve des gens près de chez toi qui font le même défi.</p>
            {open[0] === undefined ? null : (
              <button type="button" className="challenges-team-btn" onClick={() => setJoining(open[0] ?? null)}>
                Trouve-moi une équipe
              </button>
            )}
          </section>

          {open.length === 0 ? (
            <p className="steve-detail-secondary challenges-all-joined">Tu as rejoint tous les défis du moment.</p>
          ) : (
            <section className="steve-card" aria-labelledby="challenges-partners-title">
              <h2 id="challenges-partners-title" className="steve-card-title">Proposés par nos partenaires</h2>
              <ul className="challenges-list">
                {open.map((challenge) => (
                  <li key={challenge.id} className="challenges-item">
                    <PartnerLogo partner={challenge.partner} />
                    <span className="challenges-item-copy">
                      <span className="steve-detail-primary">{challenge.title}</span>
                      <span className="steve-detail-secondary">
                        {challenge.partner.name} · {challenge.days} jours ·{" "}
                        {challengeStatus(challenge) === "ongoing" ? "déjà commencé" : startLabel(challenge).toLowerCase()}
                      </span>
                      <span className="challenges-meta">
                        {challenge.berries} Berries · {challenge.teams} équipes
                        {challenge.friend === undefined ? null : <> · {challenge.friend} y participe</>}
                      </span>
                    </span>
                    <button type="button" className="challenges-join" onClick={() => setJoining(challenge)}>
                      Rejoindre
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <button type="button" className="challenges-link challenges-reset" onClick={resetCommunity}>
        Réinitialiser la démo
      </button>

      {joining === null ? null : <JoinSheet challenge={joining} onClose={close} />}
    </FeatureShell>
  );
}

const mineLabels: Record<MineView, string> = { ongoing: "En cours", upcoming: "À venir", history: "Historique" };

function ActiveChallenge(props: { readonly challenge: Challenge; readonly teammates: readonly string[] }) {
  const { challenge, teammates } = props;
  const status = challengeStatus(challenge);
  const today = challengeDay(challenge);
  return (
    <section className="steve-card challenges-active" aria-label={`Défi : ${challenge.title}`}>
      <div className="challenges-between">
        <Eyebrow tone={status === "ongoing" ? "orange" : "indigo"}>
          {status === "ongoing" ? `Jour ${today} sur ${challenge.days}` : startLabel(challenge)}
        </Eyebrow>
        {teammates.length > 0 ? <span className="challenges-mult">{multiplierLabel()} en équipe</span> : null}
      </div>
      <div className="challenges-between">
        <div>
          <h2 className="steve-card-title">{challenge.title}</h2>
          <p className="steve-detail-secondary">
            {challenge.goal} · par {challenge.partner.name}
          </p>
        </div>
        <Avatars names={["Moi", ...teammates]} />
      </div>
      <ol className="challenges-days" aria-label={`${challenge.days} jours`}>
        {Array.from({ length: challenge.days }, (_, day) => (
          <li key={day} data-state={day + 1 < today ? "done" : day + 1 === today ? "today" : undefined}>
            J{day + 1}
          </li>
        ))}
      </ol>
      <div className="challenges-between">
        <p className="steve-detail-secondary">{rewardFor(challenge, teammates)} Berries à la clé</p>
        <button
          type="button"
          className="challenges-link"
          onClick={() => updateCommunity((current) => leaveChallenge(current, challenge.id))}
        >
          Quitter
        </button>
      </div>
    </section>
  );
}

type Line = { readonly from: "steve" | "me"; readonly text: string };

function openingLines(challenge: Challenge): readonly Line[] {
  const bonus = `En équipe, tes Berries sont multipliées par ${multiplierLabel().slice(1)}.`;
  if (challenge.friend !== undefined) {
    return [
      { from: "steve", text: `Le défi « ${challenge.title} » commence lundi. ${challenge.friend} le fait aussi. Tu veux le faire ensemble ?` },
      { from: "steve", text: bonus },
    ];
  }
  return [
    { from: "steve", text: `Le défi « ${challenge.title} » dure ${challenge.days} jours. Tu le fais seul·e ou en équipe ?` },
    { from: "steve", text: bonus },
  ];
}

function choiceLabel(choice: Choice, challenge: Challenge): string {
  if (choice === "friend") return `Oui, avec ${challenge.friend ?? demoFriend.name}`;
  if (choice === "team") return "Trouve-moi une équipe";
  return "Seul·e pour l’instant";
}

export function JoinSheet(props: { readonly challenge: Challenge; readonly onClose: () => void }) {
  const { challenge } = props;
  const [choice, setChoice] = useState<Choice | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const choices: readonly Choice[] = challenge.friend === undefined ? ["team", "solo"] : ["friend", "team", "solo"];
  const teammates = choice === null ? [] : teammatesFor(choice, challenge);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  function pick(next: Choice) {
    setChoice(next);
    updateCommunity((current) => joinChallenge(current, challenge.id, teammatesFor(next, challenge)));
  }

  const lines: Line[] = [...openingLines(challenge)];
  if (choice !== null) {
    lines.push({ from: "me", text: choiceLabel(choice, challenge) });
    if (choice === "team") {
      lines.push({ from: "steve", text: `J’ai trouvé ${foundTeam.join(" et ")}, qui font aussi ce défi près de chez toi.` });
    }
  }
  const together = teammates.length > 0;

  return (
    <div className="challenges-sheet-layer">
      <button type="button" className="challenges-sheet-backdrop" aria-label="Fermer" tabIndex={-1} onClick={props.onClose} />
      <section className="challenges-sheet" role="dialog" aria-modal="true" aria-labelledby="challenges-sheet-title">
        <header className="challenges-sheet-head">
          <img src={askAvatarSrc} alt="" width={38} height={38} />
          <span>
            <strong id="challenges-sheet-title">Stevie</strong>
            <span>{challenge.title}</span>
          </span>
          <button ref={closeRef} type="button" className="challenges-sheet-close" aria-label="Fermer" onClick={props.onClose}>
            ×
          </button>
        </header>
        <ol className="challenges-chat" aria-live="polite">
          {lines.map((line, index) => (
            <li key={index} className={`challenges-msg challenges-msg-${line.from}`}>
              {line.text}
            </li>
          ))}
          {choice === null ? null : (
            <>
              <li className="challenges-confirm">
                <Eyebrow tone="teal">Participation confirmée</Eyebrow>
                <div className="challenges-between">
                  <span>
                    <strong>{challenge.title}</strong>
                    <span className="steve-detail-secondary">
                      {challenge.days} jours · {rewardFor(challenge, teammates)} Berries à la clé
                    </span>
                  </span>
                  <Avatars names={["Moi", ...teammates]} />
                </div>
              </li>
              <li className="challenges-msg challenges-msg-steve">
                {together
                  ? "C’est noté. Je vous fais un point chaque matin. Et si tu es crevé·e un soir, on met le défi en pause, sans souci."
                  : "C’est noté. Je te fais un point chaque matin. Et si tu es crevé·e un soir, on met le défi en pause, sans souci."}
              </li>
            </>
          )}
        </ol>
        <div className="challenges-quick">
          {choice === null ? (
            choices.map((item) => (
              <button key={item} type="button" onClick={() => pick(item)}>
                {choiceLabel(item, challenge)}
              </button>
            ))
          ) : (
            <button type="button" className="challenges-quick-primary" onClick={props.onClose}>
              Voir mes défis
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
