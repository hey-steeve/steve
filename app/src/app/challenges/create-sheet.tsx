"use client";

import { useEffect, useRef, useState } from "react";
import { communityToday, type Challenge } from "../../community/demo";
import {
  createChallenge,
  customDurations,
  friendsOf,
  nextMonday,
  updateCommunity,
  useCommunity,
} from "../../community/store";

// Create your own challenge. It stays private: no Berries, and only the
// friends you pick can see it and join.
export function CreateSheet(props: { readonly onClose: (created: Challenge | null) => void }) {
  const state = useCommunity();
  const friends = friendsOf(state);
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [days, setDays] = useState<number>(7);
  const [startsOn, setStartsOn] = useState(nextMonday());
  const [friendIds, setFriendIds] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const { onClose } = props;

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleFriend(id: string) {
    setFriendIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createChallenge(state, { title, goal, days, startsOn, friendIds });
    if (result === null) {
      setError("Donne un nom et un objectif d’au moins 3 caractères.");
      return;
    }
    updateCommunity(() => result.state);
    onClose(result.challenge);
  }

  const starts = [
    { value: communityToday, label: "Aujourd’hui" },
    { value: nextMonday(), label: "Lundi" },
  ];

  return (
    <div className="challenges-sheet-layer">
      <button type="button" className="challenges-sheet-backdrop" aria-label="Fermer" tabIndex={-1} onClick={() => onClose(null)} />
      <section className="challenges-sheet create-sheet" role="dialog" aria-modal="true" aria-labelledby="create-sheet-title">
        <header className="create-head">
          <h2 id="create-sheet-title" className="steve-card-title">
            Crée ton défi
          </h2>
          <button type="button" className="challenges-sheet-close" aria-label="Fermer" onClick={() => onClose(null)}>
            ×
          </button>
        </header>
        <form className="create-form" onSubmit={submit}>
          <label className="steve-field-group">
            <span className="steve-field-label">Nom du défi</span>
            <input
              ref={titleRef}
              className="steve-input"
              value={title}
              maxLength={40}
              placeholder="Ex. Marche du midi"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="steve-field-group">
            <span className="steve-field-label">Objectif</span>
            <input
              className="steve-input"
              value={goal}
              maxLength={60}
              placeholder="Ex. 20 minutes de marche après déjeuner"
              onChange={(event) => setGoal(event.target.value)}
            />
          </label>
          <fieldset className="create-fieldset">
            <legend className="steve-field-label">Durée</legend>
            <div className="create-options">
              {customDurations.map((value) => (
                <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>
                  {value} jours
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="create-fieldset">
            <legend className="steve-field-label">Début</legend>
            <div className="create-options">
              {starts.map((item) => (
                <button key={item.value} type="button" aria-pressed={startsOn === item.value} onClick={() => setStartsOn(item.value)}>
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
          {friends.length === 0 ? null : (
            <fieldset className="create-fieldset">
              <legend className="steve-field-label">Inviter des amis</legend>
              <div className="create-options">
                {friends.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    aria-pressed={friendIds.includes(friend.id)}
                    onClick={() => toggleFriend(friend.id)}
                  >
                    {friend.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <p className="steve-detail-secondary create-note">
            Défi privé : visible par toi et tes invités seulement. Pas de Berries sur les défis perso.
          </p>
          {error === null ? null : (
            <p className="steve-alert" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="steve-btn-primary">
            Créer le défi
          </button>
        </form>
      </section>
    </div>
  );
}
