"use client";

import { useSyncExternalStore } from "react";

// The demo runs two profiles side by side: an Alan member, who gets every
// feature, and a free account, who sees the premium features locked in grey.
export type Plan = "alan" | "free";

export const plans: readonly Plan[] = ["alan", "free"];

export const planLabels: Record<Plan, string> = {
  alan: "Alan member",
  free: "No subscription",
};

export type PremiumFeature = "berries" | "booking-call" | "vault" | "phone-reminders" | "memory";

// What a free account cannot use. Chat, directory, agenda and challenges stay
// free; Berries and everything where Stevie acts for you are for members.
export const premiumFeatures: Record<PremiumFeature, { readonly title: string; readonly detail: string }> = {
  berries: { title: "Berries and rewards", detail: "Earn Berries with every challenge" },
  "booking-call": { title: "Stevie calls the practice", detail: "Books the appointment for you" },
  vault: { title: "Health vault", detail: "Your documents, filed and summarized" },
  "phone-reminders": { title: "Reminder calls", detail: "Stevie calls you before each appointment" },
  memory: { title: "Long memory", detail: "Stevie remembers everything, call after call" },
};

export function isMember(plan: Plan): boolean {
  return plan === "alan";
}

// Alan's App Store listing. A search link keeps the demo honest if the
// listing id changes.
export const alanAppStoreUrl = "https://apps.apple.com/fr/search?term=alan%20assurance%20sant%C3%A9";

const storageKey = "steve.plan.v1";
const listeners = new Set<() => void>();
let current: Plan | null = null;

function isPlan(value: unknown): value is Plan {
  return value === "alan" || value === "free";
}

function read(): Plan {
  if (current !== null) return current;
  current = "alan";
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (isPlan(saved)) current = saved;
  } catch {
    current = "alan";
  }
  return current;
}

export function setPlan(plan: Plan): void {
  current = plan;
  try {
    window.localStorage.setItem(storageKey, plan);
  } catch {
    // Storage can be blocked; the plan still holds for this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePlan(): Plan {
  return useSyncExternalStore(subscribe, read, () => "alan");
}
