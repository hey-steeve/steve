"use client";

import { loadDemoPatientMemory, type PatientMemory } from "@steve/profile";
import Link from "next/link";
import { useEffect, useState } from "react";
import { pageMascots } from "../../chat/faces";
import { isMember, usePlan } from "../../community/plan";
import { PremiumTag } from "../challenges/community-ui";
import "./home-memory.css";

export type MemoryFact = { readonly kind: "family" | "care" | "habit" | "visit"; readonly label: string; readonly text: string };

// What Stevie remembers, read back as declared. No interpretation: each fact
// is a field of the patient memory, shown as it was given.
export function memoryFacts(memory: PatientMemory): readonly MemoryFact[] {
  const facts: MemoryFact[] = [];
  for (const child of memory.identity.children) {
    facts.push({ kind: "family", label: "Family", text: `${child.givenName}, age ${child.ageYears}` });
  }
  const visits = memory.declaredHistory.flatMap((entry) => (entry.kind === "visit" ? [entry] : []));
  const doctor = visits.find((visit) => visit.specialty === "médecin traitant");
  if (doctor !== undefined) {
    facts.push({ kind: "care", label: "Regular doctor", text: doctor.practitioner.name });
  }
  for (const preference of memory.preferences) {
    facts.push({ kind: "habit", label: "Preference", text: preference });
  }
  const last = visits.at(-1);
  if (last !== undefined) {
    facts.push({ kind: "visit", label: "Last appointment", text: `${last.reason} · ${last.specialty}` });
  }
  return facts;
}

const freeFacts = 2;

export function MemoryCard(props: { readonly variant?: "home" | "profile" }) {
  const member = isMember(usePlan());
  const [memory] = useState(loadDemoPatientMemory);
  const facts = memoryFacts(memory);
  const shown = member ? facts : facts.slice(0, freeFacts);
  const hidden = facts.length - shown.length;
  const home = props.variant !== "profile";

  return (
    <section className="chat-home-card home-memory" aria-labelledby={`home-memory-title-${home ? "home" : "profile"}`}>
      <div className="home-memory-head">
        <img className="home-memory-mascot" src={pageMascots.memory} alt="" width={300} height={544} />
        <span className="home-memory-intro">
          <span className="home-memory-eyebrow">
            <SparkIcon />
            Stevie’s memory
          </span>
          <h2 id={`home-memory-title-${home ? "home" : "profile"}`}>I remember you</h2>
          <span>
            No need to repeat yourself: I use it to search, call and remind you.
          </span>
        </span>
      </div>
      <ul className="home-memory-facts">
        {shown.map((fact) => (
          <li key={`${fact.label}-${fact.text}`} className={`home-memory-fact home-memory-${fact.kind}`}>
            <span>{fact.label}</span>
            <strong>{fact.text}</strong>
          </li>
        ))}
        {hidden > 0 ? (
          <li className="home-memory-fact home-memory-locked">
            <span>
              {hidden} more memories <PremiumTag />
            </span>
            <strong>With Alan, Stevie keeps everything from one call to the next.</strong>
          </li>
        ) : null}
      </ul>
      {home ? (
        <Link className="home-memory-link" href="/profile#ton-stevie">
          Customize my Stevie
        </Link>
      ) : null}
    </section>
  );
}

type StyleKey = "address" | "tone" | "calls";

export type AgentStyle = Readonly<Record<StyleKey, string>>;

const defaultStyle: AgentStyle = { address: "tu", tone: "doux", calls: "soir" };
const styleKey = "steve.agent.style.v1";

const styleOptions: Readonly<Record<StyleKey, readonly { readonly value: string; readonly label: string }[]>> = {
  address: [
    { value: "tu", label: "Casual" },
    { value: "vous", label: "Formal" },
  ],
  tone: [
    { value: "doux", label: "Gentle" },
    { value: "direct", label: "Direct" },
    { value: "drole", label: "Playful" },
  ],
  calls: [
    { value: "soir", label: "Evenings" },
    { value: "samedi", label: "Saturday morning" },
    { value: "jamais", label: "Never" },
  ],
};

const styleLabels: Record<StyleKey, string> = {
  address: "How I talk to you",
  tone: "My tone",
  calls: "When I call you",
};

function readStyle(): AgentStyle {
  try {
    const raw = window.localStorage.getItem(styleKey);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return defaultStyle;
    const pick = (key: StyleKey): string => {
      const value: unknown = Reflect.get(parsed, key);
      return styleOptions[key].find((option) => option.value === value)?.value ?? defaultStyle[key];
    };
    return { address: pick("address"), tone: pick("tone"), calls: pick("calls") };
  } catch {
    return defaultStyle;
  }
}

// The person shapes their own Stevie: how it speaks and when it may call.
export function AgentStyleCard() {
  const member = isMember(usePlan());
  const [style, setStyle] = useState<AgentStyle>(defaultStyle);

  useEffect(() => {
    setStyle(readStyle());
  }, []);

  function choose(key: StyleKey, value: string) {
    const next = { ...style, [key]: value };
    setStyle(next);
    try {
      window.localStorage.setItem(styleKey, JSON.stringify(next));
    } catch {
      // Storage can be blocked; the choice holds for this session.
    }
  }

  const keys: readonly StyleKey[] = ["address", "tone", "calls"];
  return (
    <section id="ton-stevie" className="steve-card agent-style" aria-labelledby="agent-style-title">
      <div className="agent-style-head">
        <h2 id="agent-style-title" className="steve-card-title">Your Stevie</h2>
        <span className="steve-detail-secondary">It adapts to you</span>
      </div>
      {keys.map((key) => {
        const locked = key === "calls" && !member;
        return (
          <fieldset key={key} className="agent-style-group" disabled={locked} data-locked={locked ? "" : undefined}>
            <legend>
              {styleLabels[key]}
              {locked ? <PremiumTag /> : null}
            </legend>
            <div className="agent-style-options">
              {styleOptions[key].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={!locked && style[key] === option.value}
                  onClick={() => choose(key, option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}
      <p className="agent-style-preview">
        <span aria-hidden="true">«</span> {previewLine(style)} <span aria-hidden="true">»</span>
      </p>
    </section>
  );
}

export function previewLine(style: AgentStyle): string {
  const you = style.address === "tu";
  if (style.tone === "direct") {
    return you ? "Your appointment is Tuesday at 6:30 pm. I’ll remind you the day before." : "Your appointment is on Tuesday at 6:30 pm. I will remind you the day before.";
  }
  if (style.tone === "drole") {
    return you
      ? "Tuesday 6:30 pm, all set! Your knee and I are counting on you."
      : "Tuesday 6:30 pm, all set! Your calendar and I are counting on you.";
  }
  return you
    ? "I found a slot Tuesday at 6:30 pm, after work. Does that work?"
    : "I found a slot on Tuesday at 6:30 pm, after your working day. Would that suit you?";
}

function SparkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.2 6.3L20 10l-5.8 1.7L12 18l-2.2-6.3L4 10l5.8-1.7z" />
    </svg>
  );
}
