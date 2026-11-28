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
  FeatureShell,
  LockIcon,
  SettingsIcon,
  UserIcon,
} from "../feature-shell";
import { isMember, premiumFeatures, usePlan, type PremiumFeature } from "../../community/plan";
import { useCommunity } from "../../community/store";
import { AlanAppBar, AlanLogo, PlanSwitch, PremiumTag } from "../challenges/community-ui";
import { AgentStyleCard, MemoryCard } from "../chat/home-memory";
import { ProfileChallenges, ProfileInvite } from "./profile-community";
import "./profile.css";

type ProfileSection = "preferences" | "history" | "edit" | null;

const mutationMessages: Record<ProfileMutationError, string> = {
  "invalid-input": "Enter valid text before saving.",
  duplicate: "This preference is already saved.",
  "not-found": "Item not found.",
  "limit-reached": "Limit reached for this section.",
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
  const plan = usePlan();
  const member = isMember(plan);
  const community = useCommunity();

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
    setFeedback({ kind: "ok", text: "Preference added." });
  }

  function handleRemovePreference(preference: string) {
    const result = storeRef.current.removePreference(preference);
    if (!result.ok) {
      setFeedback({ kind: "error", text: mutationMessages[result.reason] });
      return;
    }
    setMemory(result.memory);
    setFeedback({ kind: "ok", text: "Preference removed." });
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
    setFeedback({ kind: "ok", text: "Declared note saved." });
  }

  return (
    <FeatureShell
      current="/profile"
      title="My profile"
      heroMascot={{ src: pageMascots.profile, width: 600, height: 600 }}
    >
      <section className="profile-identity-card" aria-label="Patient identity">
        <span className="profile-avatar" aria-hidden="true">
          {initialsFor(memory)}
        </span>
        <div className="steve-detail-copy">
          <h2 className="profile-name">
            {memory.identity.givenName} {memory.identity.familyName}
          </h2>
          <span className="profile-plan" data-member={member ? "" : undefined}>
            {member ? <AlanLogo size={16} /> : null}
            {member ? "Alan member" : "Free account"}
          </span>
        </div>
      </section>

      <section className="steve-card profile-demo" aria-label="Demo profile">
        <span className="steve-detail-secondary">Demo profile</span>
        <PlanSwitch plan={plan} />
      </section>

      <MembershipCard member={member} />

      <MemoryCard variant="profile" />
      <AgentStyleCard />

      <ProfileChallenges />
      <AlanAppBar plan={plan} berries={community.berries} />
      <ProfileInvite />

      <section className="steve-card" aria-label="Profile sections">
        <ul className="steve-row-list">
          <li>
            <Link className="steve-row-button" href="/vault" data-locked={member ? undefined : ""}>
              <LockIcon />
              <span>Vault</span>
              {member ? null : <PremiumTag />}
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
              <span>Preferences</span>
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
              <span>Declared history</span>
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
          <span>Edit my profile</span>
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
            Preferences
          </h2>
          {memory.preferences.length === 0 ? (
            <p className="steve-detail-secondary">No preference saved.</p>
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
                    Remove
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
            Declared history
          </h2>
          <p className="steve-detail-secondary">
            Declared memory, kept without medical interpretation.
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
                      Seen {entry.seenOn} · {entry.reason}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {section === "edit" ? (
        <section className="steve-card" aria-labelledby="profile-edit-title">
          <h2 id="profile-edit-title" className="steve-card-title">
            Edit my profile
          </h2>
          <p className="steve-detail-secondary">
            {memory.identity.situation} · {memory.identity.ageYears} years old
          </p>
          <form className="profile-form" onSubmit={handleAddPreference}>
            <div className="steve-field-group">
              <label className="steve-field-label" htmlFor="profile-new-preference">
                Add a preference
              </label>
              <input
                id="profile-new-preference"
                className="steve-input"
                value={newPreference}
                placeholder="E.g. Sector 1 practitioners only"
                onChange={(event) => setNewPreference(event.target.value)}
              />
            </div>
            <button type="submit" className="steve-btn-primary">
              Save preference
            </button>
          </form>
          <hr className="steve-divider" />
          <form className="profile-form" onSubmit={handleAddNote}>
            <div className="steve-field-group">
              <label className="steve-field-label" htmlFor="profile-new-note">
                Add a declared note
              </label>
              <textarea
                id="profile-new-note"
                className="steve-textarea"
                value={newNote}
                placeholder="E.g. Follow-up appointment planned in December"
                onChange={(event) => setNewNote(event.target.value)}
              />
            </div>
            <button type="submit" className="steve-btn-secondary">
              Add note
            </button>
          </form>
        </section>
      ) : null}
    </FeatureShell>
  );
}

const featureOrder: readonly PremiumFeature[] = ["memory", "booking-call", "phone-reminders", "vault", "berries"];

// What membership adds. Members see it all unlocked; a free account sees
// the same list in grey, so the value of Alan is plain.
function MembershipCard(props: { readonly member: boolean }) {
  return (
    <section
      className="steve-card profile-membership"
      data-member={props.member ? "" : undefined}
      aria-labelledby="profile-membership-title"
    >
      <div className="profile-membership-head">
        <AlanLogo size={40} />
        <span>
          <h2 id="profile-membership-title" className="steve-card-title">
            {props.member ? "All of Stevie, with Alan" : "Upgrade to Stevie + Alan"}
          </h2>
          <span className="steve-detail-secondary">
            {props.member ? "Included in your Alan health insurance." : "These features unlock with Alan."}
          </span>
        </span>
      </div>
      <ul className="profile-features">
        {featureOrder.map((id) => (
          <li key={id} data-locked={props.member ? undefined : ""}>
            <span className="profile-feature-mark" aria-hidden="true">
              {props.member ? "✓" : <LockIcon />}
            </span>
            <span>
              <strong>{premiumFeatures[id].title}</strong>
              <span>{premiumFeatures[id].detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
