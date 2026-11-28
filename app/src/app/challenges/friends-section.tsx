"use client";

import { useState } from "react";
import { type Challenge, type Person } from "../../community/demo";
import {
  addFriend,
  challengeById,
  challengeStatus,
  findPeople,
  friendsOf,
  membershipFor,
  removeFriend,
  startLabel,
  updateCommunity,
  useCommunity,
} from "../../community/store";
import { Avatars, Eyebrow } from "./community-ui";

// Friends: see what they are doing, add new ones, join them in one tap.
export function FriendsSection(props: { readonly onJoin: (challenge: Challenge) => void }) {
  const state = useCommunity();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const friends = friendsOf(state);
  const people = findPeople(state, query);

  return (
    <>
      <section className="steve-card" aria-labelledby="friends-add-title">
        <div className="challenges-between">
          <h2 id="friends-add-title" className="steve-card-title">
            Mes amis · {friends.length}
          </h2>
          <button
            type="button"
            className="friends-add-toggle"
            aria-expanded={adding}
            onClick={() => {
              setAdding((value) => !value);
              setQuery("");
            }}
          >
            {adding ? "Fermer" : "+ Ajouter"}
          </button>
        </div>
        {adding ? (
          <div className="friends-add">
            <input
              className="steve-input"
              value={query}
              placeholder="Nom ou ville"
              aria-label="Chercher une personne"
              onChange={(event) => setQuery(event.target.value)}
            />
            {people.length === 0 ? (
              <p className="steve-detail-secondary">Personne ne correspond. Invite-le avec ton code depuis ton profil.</p>
            ) : (
              <ul className="friends-list">
                {people.map((person) => (
                  <li key={person.id} className="friends-row">
                    <Avatars names={[person.name]} />
                    <span className="challenges-item-copy">
                      <span className="steve-detail-primary">{person.name}</span>
                      <span className="steve-detail-secondary">{person.city}</span>
                    </span>
                    <button
                      type="button"
                      className="challenges-join"
                      onClick={() => updateCommunity((current) => addFriend(current, person.id))}
                    >
                      Ajouter
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      {friends.length === 0 ? (
        <p className="steve-detail-secondary challenges-all-joined">Ajoute des amis pour voir leurs défis.</p>
      ) : (
        <ul className="friends-cards">
          {friends.map((friend) => (
            <FriendCard
              key={friend.id}
              friend={friend}
              open={openId === friend.id}
              onToggle={() => setOpenId((current) => (current === friend.id ? null : friend.id))}
              onJoin={props.onJoin}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function FriendCard(props: {
  readonly friend: Person;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onJoin: (challenge: Challenge) => void;
}) {
  const state = useCommunity();
  const { friend } = props;
  const challenges = friend.challenges.flatMap((item) => {
    const challenge = challengeById(item.challengeId);
    return challenge === undefined ? [] : [{ challenge, teammates: item.teammates }];
  });
  const active = challenges.filter((item) => challengeStatus(item.challenge) === "ongoing").length;

  return (
    <li className="steve-card friends-card">
      <button type="button" className="friends-head" aria-expanded={props.open} onClick={props.onToggle}>
        <Avatars names={[friend.name]} />
        <span className="challenges-item-copy">
          <span className="steve-detail-primary">{friend.name}</span>
          <span className="steve-detail-secondary">
            {challenges.length === 0
              ? "Aucun défi en ce moment"
              : `${challenges.length} défi${challenges.length > 1 ? "s" : ""}${active > 0 ? ` · ${active} en cours` : ""}`}{" "}
            · {friend.done} terminés
          </span>
        </span>
        <span className="friends-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      {props.open ? (
        <div className="friends-detail">
          {challenges.map(({ challenge, teammates }) => {
            const joined = membershipFor(state, challenge.id) !== undefined;
            const status = challengeStatus(challenge);
            return (
              <div key={challenge.id} className="friends-challenge">
                <span className="challenges-item-copy">
                  <Eyebrow tone={status === "ongoing" ? "orange" : "indigo"}>
                    {status === "ongoing" ? "En cours" : startLabel(challenge)}
                  </Eyebrow>
                  <span className="steve-detail-primary">{challenge.title}</span>
                  <span className="steve-detail-secondary">
                    {challenge.goal}
                    {teammates.length > 0 ? ` · avec ${teammates.join(" et ")}` : ""}
                  </span>
                </span>
                {joined ? (
                  <span className="friends-joined">Tu y es</span>
                ) : (
                  <button
                    type="button"
                    className="challenges-join"
                    onClick={() => props.onJoin({ ...challenge, friend: friend.name })}
                  >
                    Le rejoindre
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            className="challenges-link"
            onClick={() => updateCommunity((current) => removeFriend(current, friend.id))}
          >
            Retirer {friend.name} de mes amis
          </button>
        </div>
      ) : null}
    </li>
  );
}
