"use client";

import { pageMascots } from "../../chat/faces";
import {
  createInMemoryProfileStore,
  loadDemoPatientMemory,
  type PatientMemory,
  type ProfileMutationError,
} from "@steve/profile";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  CalendarIcon,
  ChevronRightIcon,
  DocumentIcon,
  FeatureShell,
  PhoneOutlineIcon,
  SettingsIcon,
  UserIcon,
} from "../feature-shell";
import { ProfileChallenges, ProfileInvite } from "./profile-community";
import "./profile.css";

type ProfileSection = "preferences" | "history" | "calls" | "edit" | null;

const mutationMessages: Record<ProfileMutationError, string> = {
  "invalid-input": "Saisis un texte valide avant d’enregistrer.",
  duplicate: "Cette préférence est déjà enregistrée.",
  "not-found": "Élément introuvable.",
  "limit-reached": "Limite atteinte pour cette section.",
};

function initialsFor(memory: PatientMemory): string {
  const first = memory.identity.givenName.trim().charAt(0).toUpperCase();
  const last = memory.identity.familyName.trim().charAt(0).toUpperCase();
  return `${first}${last}` || "ST";
}

export default function ProfileClient(props: {
  readonly initialMemory?: PatientMemory;
}) {
  const storeRef = useRef(
    createInMemoryProfileStore(props.initialMemory ?? loadDemoPatientMemory()),
  );
  const [memory, setMemory] = useState<PatientMemory>(() => storeRef.current.get());
  const [section, setSection] = useState<ProfileSection>(null);
  const [newPreference, setNewPreference] = useState("");
  const [newNote, setNewNote] = useState("");
  const [feedback, setFeedback] = useState<{ readonly kind: "ok" | "error"; readonly text: string } | null>(null);

  function toggleSection(next: Exclude<ProfileSection, null>) {
    setSection((current) => (current === next ? null : next));
    setFeedback(null);
  }

  function handleAddPreference(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = storeRef.current.addPreference(newPreference);
    if (!result.ok) {
      setFeedback({ kind: "error", text: mutationMessages[result.reason] });
      return;
    }
    setMemory(result.memory);
    setNewPreference("");
    setFeedback({ kind: "ok", text: "Préférence ajoutée." });
  }

  function handleRemovePreference(preference: string) {
    const result = storeRef.current.removePreference(preference);
    if (!result.ok) {
      setFeedback({ kind: "error", text: mutationMessages[result.reason] });
      return;
    }
    setMemory(result.memory);
    setFeedback({ kind: "ok", text: "Préférence retirée." });
  }

  function handleAddNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = storeRef.current.addDeclaredNote(newNote);
    if (!result.ok) {
      setFeedback({ kind: "error", text: mutationMessages[result.reason] });
      return;
    }
    setMemory(result.memory);
    setNewNote("");
    setFeedback({ kind: "ok", text: "Note déclarée enregistrée." });
  }

  return (
    <FeatureShell
      current="/profile"
      title="Mon profil"
      heroMascot={{ src: pageMascots.profile, width: 600, height: 600 }}
    >
      <section className="profile-identity-card" aria-label="Identité du patient">
        <span className="profile-avatar" aria-hidden="true">
          {initialsFor(memory)}
        </span>
        <div className="steve-detail-copy">
          <h2 className="profile-name">
            {memory.identity.givenName} {memory.identity.familyName}
          </h2>
        </div>
      </section>

      <ProfileChallenges />
      <ProfileInvite />

      <section className="steve-card" aria-label="Rubriques du profil">
        <ul className="steve-row-list">
          <li>
            <Link className="steve-row-button" href="/vault">
              <DocumentIcon />
              <span>Mes documents</span>
              <span className="steve-row-chevron" aria-hidden="true">
                <ChevronRightIcon />
              </span>
            </Link>
          </li>
          <li>
            <button
              type="button"
              className="steve-row-button"
              aria-expanded={section === "preferences"}
              onClick={() => toggleSection("preferences")}
            >
              <SettingsIcon />
              <span>Préférences</span>
              <span className="steve-row-chevron" aria-hidden="true">
                <ChevronRightIcon />
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className="steve-row-button"
              aria-expanded={section === "history"}
              onClick={() => toggleSection("history")}
            >
              <CalendarIcon />
              <span>Historique déclaré</span>
              <span className="steve-row-chevron" aria-hidden="true">
                <ChevronRightIcon />
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className="steve-row-button"
              aria-expanded={section === "calls"}
              onClick={() => toggleSection("calls")}
            >
              <PhoneOutlineIcon />
              <span>Historique des appels</span>
              <span className="steve-row-chevron" aria-hidden="true">
                <ChevronRightIcon />
              </span>
            </button>
          </li>
        </ul>

        <button
          type="button"
          className="steve-btn-primary"
          aria-expanded={section === "edit"}
          onClick={() => toggleSection("edit")}
        >
          <UserIcon />
          <span>Modifier mon profil</span>
        </button>
      </section>

      {feedback === null ? null : (
        <p
          className={feedback.kind === "error" ? "steve-alert" : "steve-status"}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.text}
        </p>
      )}

      {section === "preferences" ? (
        <section className="steve-card" aria-labelledby="profile-preferences-title">
          <h2 id="profile-preferences-title" className="steve-card-title">
            Préférences
          </h2>
          {memory.preferences.length === 0 ? (
            <p className="steve-detail-secondary">Aucune préférence enregistrée.</p>
          ) : (
            <ul className="profile-entry-list">
              {memory.preferences.map((item) => (
                <li key={item} className="profile-entry profile-entry-row">
                  <span>{item}</span>
                  <button
                    type="button"
                    className="profile-remove-btn"
                    onClick={() => handleRemovePreference(item)}
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {section === "history" ? (
        <section className="steve-card" aria-labelledby="profile-history-title">
          <h2 id="profile-history-title" className="steve-card-title">
            Historique déclaré
          </h2>
          <p className="steve-detail-secondary">
            Mémoire déclarée conservée sans interprétation médicale.
          </p>
          <ul className="profile-entry-list">
            {memory.declaredHistory.map((entry, index) => (
              <li key={`${entry.kind}-${index}`} className="profile-entry">
                {entry.kind === "note" ? (
                  <span>{entry.text}</span>
                ) : (
                  <>
                    <span className="steve-detail-primary">
                      {entry.practitioner.name} · {entry.specialty}
                    </span>
                    <span className="steve-detail-secondary">
                      Vu le {entry.seenOn} · {entry.reason}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {section === "calls" ? (
        <section className="steve-card" aria-labelledby="profile-calls-title">
          <h2 id="profile-calls-title" className="steve-card-title">
            Historique des appels
          </h2>
          {memory.callHistory.length === 0 ? (
            <p className="steve-detail-secondary">
              Aucun appel enregistré pour le moment.
            </p>
          ) : (
            <ul className="profile-entry-list">
              {memory.callHistory.map((call, index) => (
                <li key={`${call.at}-${index}`} className="profile-entry">
                  <span className="steve-detail-primary">
                    {call.at} · {call.direction === "in" ? "Appel entrant" : "Appel sortant"}
                  </span>
                  <span>{call.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {section === "edit" ? (
        <section className="steve-card" aria-labelledby="profile-edit-title">
          <h2 id="profile-edit-title" className="steve-card-title">
            Modifier mon profil
          </h2>
          <p className="steve-detail-secondary">
            {memory.identity.situation} · {memory.identity.ageYears} ans
          </p>
          <form className="profile-form" onSubmit={handleAddPreference}>
            <div className="steve-field-group">
              <label className="steve-field-label" htmlFor="profile-new-preference">
                Ajouter une préférence
              </label>
              <input
                id="profile-new-preference"
                className="steve-input"
                value={newPreference}
                placeholder="Ex. Praticien secteur 1 uniquement"
                onChange={(event) => setNewPreference(event.target.value)}
              />
            </div>
            <button type="submit" className="steve-btn-primary">
              Enregistrer la préférence
            </button>
          </form>
          <hr className="steve-divider" />
          <form className="profile-form" onSubmit={handleAddNote}>
            <div className="steve-field-group">
              <label className="steve-field-label" htmlFor="profile-new-note">
                Ajouter une note déclarée
              </label>
              <textarea
                id="profile-new-note"
                className="steve-textarea"
                value={newNote}
                placeholder="Ex. Rendez-vous de suivi prévu en décembre"
                onChange={(event) => setNewNote(event.target.value)}
              />
            </div>
            <button type="submit" className="steve-btn-secondary">
              Ajouter la note
            </button>
          </form>
        </section>
      ) : null}
    </FeatureShell>
  );
}
