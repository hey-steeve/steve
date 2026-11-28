"use client";

import { useEffect, useRef, useState } from "react";
import { askAvatarSrc, pageMascots } from "../../chat/faces";
import { demoChallenges, demoFriend, demoHistory, demoRewards, type Challenge } from "../../community/demo";
import { isMember, usePlan } from "../../community/plan";
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
import { CreateSheet } from "./create-sheet";
import { FriendsSection } from "./friends-section";
import {
  AlanAppBar,
  Avatars,
  Berry,
  BerriesPill,
  Eyebrow,
  PartnerLogo,
  PremiumTag,
  RewardList,
  TeamIcon,
} from "./community-ui";
import "./challenges.css";

const foundTeam = ["Inès", "Marc"] as const;

type Choice = "friend" | "team" | "solo";

export function teammatesFor(choice: Choice, challenge: Challenge): readonly string[] {
  if (choice === "friend" && challenge.friend !== undefined) return [challenge.friend];
  if (choice === "team") return foundTeam;
  return [];
}

type Section = "mine" | "discover" | "friends" | "rewards";
type MineView = "ongoing" | "upcoming" | "history";

const sections: readonly Section[] = ["mine", "discover", "friends"];
const sectionLabels: Record<Section, string> = {
  mine: "My challenges",
  discover: "Discover",
  friends: "Friends",
  rewards: "Rewards",
};

export default function ChallengesClient() {
  const state = useCommunity();
  const member = isMember(usePlan());
  const [joining, setJoining] = useState<Challenge | null>(null);
  const [section, setSection] = useState<Section>("mine");
  const [view, setView] = useState<MineView>("ongoing");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("section") === "amis") setSection("friends");
    if (params.get("section") === "recompenses") setSection("rewards");
    const id = params.get("join");
    const challenge = id === null ? undefined : challengeById(id);
    if (challenge !== undefined) {
      setSection("discover");
      setJoining(challenge);
    }
  }, []);

  const mine = state.joined.flatMap((membership) => {
    const challenge = challengeById(membership.challengeId, state);
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
      title="Challenges"
      subtitle="Look after yourself, just not alone."
      heroMascot={{ src: pageMascots.challenges, width: 600, height: 600 }}
    >
      <div className="challenges-bar">
        <div
          className="challenges-segments"
          role="tablist"
          aria-label="Challenges"
          data-index={sections.indexOf(section)}
          data-off={section === "rewards" ? "" : undefined}
        >
          <span className="challenges-segment-thumb" aria-hidden="true" />
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
        <button
          type="button"
          className="challenges-berries-btn"
          aria-pressed={section === "rewards"}
          aria-label={`${sectionLabels.rewards}${member ? ` · ${state.berries} Berries` : ""}`}
          onClick={() => setSection("rewards")}
        >
          <BerriesPill count={state.berries} locked={!member} />
        </button>
      </div>

      {section === "rewards" ? (
        <RewardsSection berries={state.berries} member={member} />
      ) : section === "mine" ? (
        <>
          <div className="challenges-chips" role="tablist" aria-label="My challenges">
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
            <section className="steve-card" aria-label="History">
              <ul className="challenges-history">
                {demoHistory.map((item) => (
                  <li key={item.title}>
                    <span className="challenges-history-check" aria-hidden="true">
                      ✓
                    </span>
                    <span className="challenges-item-copy">
                      <span className="steve-detail-primary">{item.title}</span>
                      <span className="steve-detail-secondary">
                        Completed {shortDate(item.endedOn)} · {item.days} days · {item.team}
                      </span>
                    </span>
                    {member ? (
                      <span className="challenges-earned">+{item.berries}</span>
                    ) : (
                      <span className="challenges-earned" data-locked="">
                        +{item.berries}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : (view === "ongoing" ? ongoing : upcoming).length === 0 ? (
            <section className="steve-card challenges-empty">
              <p className="steve-detail-secondary">
                {view === "ongoing" ? "No ongoing challenge for now." : "No upcoming challenge."}
              </p>
              <button type="button" className="challenges-team-btn challenges-find" onClick={() => setSection("discover")}>
                Find a challenge
              </button>
            </section>
          ) : (
            (view === "ongoing" ? ongoing : upcoming).map(({ challenge, teammates }) => (
              <ActiveChallenge key={challenge.id} challenge={challenge} teammates={teammates} member={member} />
            ))
          )}
        </>
      ) : section === "friends" ? (
        <FriendsSection onJoin={setJoining} />
      ) : (
        <>
          <section className="steve-card create-card" aria-labelledby="create-card-title">
            <span className="challenges-item-copy">
              <h2 id="create-card-title" className="steve-card-title">Your own challenge</h2>
              <span className="steve-detail-secondary">Pick the goal, the length and who you invite.</span>
            </span>
            <button type="button" className="challenges-team-btn challenges-find" onClick={() => setCreating(true)}>
              Create
            </button>
          </section>

          <section className="steve-card challenges-team" aria-labelledby="challenges-team-title">
            <div className="challenges-row">
              <TeamIcon />
              <h2 id="challenges-team-title" className="steve-card-title">No team?</h2>
            </div>
            <p className="challenges-team-copy">Stevie finds people near you doing the same challenge.</p>
            {open[0] === undefined ? null : (
              <button type="button" className="challenges-team-btn" onClick={() => setJoining(open[0] ?? null)}>
                Find me a team
              </button>
            )}
          </section>

          {open.length === 0 ? (
            <p className="steve-detail-secondary challenges-all-joined">You’ve joined every challenge running right now.</p>
          ) : (
            <section className="steve-card" aria-labelledby="challenges-partners-title">
              <h2 id="challenges-partners-title" className="steve-card-title">From our partners</h2>
              <ul className="challenges-list">
                {open.map((challenge) => (
                  <li key={challenge.id} className="challenges-item">
                    <PartnerLogo partner={challenge.partner} />
                    <span className="challenges-item-copy">
                      <span className="steve-detail-primary">{challenge.title}</span>
                      <span className="steve-detail-secondary">
                        {challenge.partner.name} · {challenge.days} days ·{" "}
                        {challengeStatus(challenge) === "ongoing" ? "already started" : startLabel(challenge)}
                      </span>
                      <span className="challenges-meta">
                        <span className="challenges-meta-berries" data-locked={member ? undefined : ""}>
                          <Berry />
                          {challenge.berries}
                        </span>{" "}
                        · {challenge.teams} teams
                        {challenge.friend === undefined ? null : <> · {challenge.friend} is in</>}
                      </span>
                    </span>
                    <button type="button" className="challenges-join" onClick={() => setJoining(challenge)}>
                      Join
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {section === "rewards" ? null : <AlanAppBar plan={member ? "alan" : "free"} berries={state.berries} />}

      <button type="button" className="challenges-link challenges-reset" onClick={resetCommunity}>
        Reset the demo
      </button>

      {joining === null ? null : <JoinSheet challenge={joining} member={member} onClose={close} />}
      {creating ? (
        <CreateSheet
          onClose={(created) => {
            setCreating(false);
            if (created === null) return;
            setSection("mine");
            setView(challengeStatus(created) === "upcoming" ? "upcoming" : "ongoing");
          }}
        />
      ) : null}
    </FeatureShell>
  );
}

const mineLabels: Record<MineView, string> = { ongoing: "Ongoing", upcoming: "Upcoming", history: "History" };

function RewardsSection(props: { readonly berries: number; readonly member: boolean }) {
  const { berries, member } = props;
  const next = [...demoRewards].sort((a, b) => a.cost - b.cost).find((reward) => reward.cost > berries);
  return (
    <>
      <section className="steve-card challenges-wallet" data-locked={member ? undefined : ""} aria-labelledby="challenges-wallet-title">
        <div className="challenges-wallet-copy">
          <Eyebrow tone={member ? "orange" : "indigo"}>{member ? "Your balance" : "For Alan members"}</Eyebrow>
          <h2 id="challenges-wallet-title" className="challenges-wallet-count">
            {member ? (
              <>
                <Berry />
                {berries}
              </>
            ) : (
              "Berries locked"
            )}
          </h2>
          <p className="challenges-wallet-hint">
            {member
              ? next === undefined
                ? "You can unlock everything. Well done!"
                : `Only ${next.cost - berries} Berries to go for “${next.title}”.`
              : "With Alan, every challenge earns you Berries to spend with our partners."}
          </p>
        </div>
        <img className="challenges-wallet-mascot" src={pageMascots.rewards} alt="" width={600} height={600} />
      </section>
      <AlanAppBar plan={member ? "alan" : "free"} berries={berries} />
      <section className="steve-card" aria-labelledby="challenges-rewards-title">
        <div className="challenges-between">
          <h2 id="challenges-rewards-title" className="steve-card-title">Rewards</h2>
          {member ? <span className="steve-detail-secondary">in the Alan app</span> : <PremiumTag />}
        </div>
        <RewardList rewards={demoRewards} berries={berries} locked={!member} />
      </section>
    </>
  );
}

function ActiveChallenge(props: {
  readonly challenge: Challenge;
  readonly teammates: readonly string[];
  readonly member: boolean;
}) {
  const { challenge, teammates, member } = props;
  const status = challengeStatus(challenge);
  const today = challengeDay(challenge);
  return (
    <section className="steve-card challenges-active" aria-label={`Challenge: ${challenge.title}`}>
      <div className="challenges-between">
        <Eyebrow tone={status === "ongoing" ? "orange" : "indigo"}>
          {status === "ongoing" ? `Day ${today} of ${challenge.days}` : startLabel(challenge)}
        </Eyebrow>
        {member && teammates.length > 0 && challenge.custom !== true ? (
          <span className="challenges-mult">{multiplierLabel()} as a team</span>
        ) : null}
      </div>
      <div className="challenges-between">
        <div>
          <h2 className="steve-card-title">{challenge.title}</h2>
          <p className="steve-detail-secondary">
            {challenge.goal} · {challenge.custom === true ? "created by you" : `by ${challenge.partner.name}`}
          </p>
        </div>
        <Avatars names={["Me", ...teammates]} />
      </div>
      <ol className="challenges-days" aria-label={`${challenge.days} days`}>
        {Array.from({ length: challenge.days }, (_, day) => (
          <li key={day} data-state={day + 1 < today ? "done" : day + 1 === today ? "today" : undefined}>
            D{day + 1}
          </li>
        ))}
      </ol>
      <div className="challenges-between">
        {challenge.custom === true ? (
          <p className="steve-detail-secondary">Personal challenge · private</p>
        ) : member ? (
          <p className="challenges-prize">
            <Berry />
            {rewardFor(challenge, teammates)} Berries to win
          </p>
        ) : (
          <PremiumTag />
        )}
        <button
          type="button"
          className="challenges-leave"
          onClick={() => updateCommunity((current) => leaveChallenge(current, challenge.id))}
        >
          Leave
        </button>
      </div>
    </section>
  );
}

type Line = { readonly from: "steve" | "me"; readonly text: string };

function openingLines(challenge: Challenge, member: boolean): readonly Line[] {
  const bonus = member
    ? `As a team, your Berries are multiplied by ${multiplierLabel().slice(1)}.`
    : "It’s easier to stick with it together. And with Alan, this challenge would earn you Berries.";
  if (challenge.friend !== undefined) {
    return [
      { from: "steve", text: `The “${challenge.title}” challenge starts Monday. ${challenge.friend} is doing it too. Want to do it together?` },
      { from: "steve", text: bonus },
    ];
  }
  return [
    { from: "steve", text: `The “${challenge.title}” challenge lasts ${challenge.days} days. Solo or as a team?` },
    { from: "steve", text: bonus },
  ];
}

function choiceLabel(choice: Choice, challenge: Challenge): string {
  if (choice === "friend") return `Yes, with ${challenge.friend ?? demoFriend.name}`;
  if (choice === "team") return "Find me a team";
  return "Solo for now";
}

export function JoinSheet(props: {
  readonly challenge: Challenge;
  readonly member: boolean;
  readonly onClose: () => void;
}) {
  const { challenge, member } = props;
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

  const lines: Line[] = [...openingLines(challenge, member)];
  if (choice !== null) {
    lines.push({ from: "me", text: choiceLabel(choice, challenge) });
    if (choice === "team") {
      lines.push({ from: "steve", text: `I found ${foundTeam.join(" and ")}, who are doing this challenge near you too.` });
    }
  }
  const together = teammates.length > 0;

  return (
    <div className="challenges-sheet-layer">
      <button type="button" className="challenges-sheet-backdrop" aria-label="Close" tabIndex={-1} onClick={props.onClose} />
      <section className="challenges-sheet" role="dialog" aria-modal="true" aria-labelledby="challenges-sheet-title">
        <header className="challenges-sheet-head">
          <img src={askAvatarSrc} alt="" width={38} height={38} />
          <span>
            <strong id="challenges-sheet-title">Stevie</strong>
            <span>{challenge.title}</span>
          </span>
          <button ref={closeRef} type="button" className="challenges-sheet-close" aria-label="Close" onClick={props.onClose}>
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
                <Eyebrow tone="teal">You’re in</Eyebrow>
                <div className="challenges-between">
                  <span>
                    <strong>{challenge.title}</strong>
                    <span className="steve-detail-secondary">
                      {challenge.days} days
                      {member ? ` · ${rewardFor(challenge, teammates)} Berries to win` : " · Berries with Alan"}
                    </span>
                  </span>
                  <Avatars names={["Me", ...teammates]} />
                </div>
              </li>
              <li className="challenges-msg challenges-msg-steve">
                {together
                  ? "Got it. I’ll check in with you both every morning. And if you’re worn out one evening, we pause the challenge, no worries."
                  : "Got it. I’ll check in every morning. And if you’re worn out one evening, we pause the challenge, no worries."}
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
              See my challenges
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
