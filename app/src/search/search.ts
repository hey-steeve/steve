// One search over the whole app, like the bar at the top of the Alan app.
// Plain data in, ranked results out, so the overlay stays a thin view.

import { demoChallenges, demoInitialFriends, demoPeople } from "../community/demo";
import { demoPractitioners } from "../app/directory/demo-practitioners";

export type SearchKind = "page" | "challenge" | "friend" | "practitioner" | "document";

export type SearchEntry = {
  readonly kind: SearchKind;
  readonly title: string;
  readonly detail: string;
  readonly href: string;
  readonly keywords?: string;
};

export const searchKindLabels: Record<SearchKind, string> = {
  page: "Rubriques",
  challenge: "Défis",
  friend: "Amis",
  practitioner: "Praticiens",
  document: "Vault",
};

const pages: readonly SearchEntry[] = [
  { kind: "page", title: "Accueil", detail: "Ton résumé du jour", href: "/chat", keywords: "home" },
  { kind: "page", title: "Défis", detail: "Mes défis, découvrir, amis", href: "/challenges", keywords: "challenge berries amis" },
  { kind: "page", title: "Agenda", detail: "Tes rendez-vous confirmés", href: "/agenda", keywords: "calendrier rdv" },
  { kind: "page", title: "Mon profil", detail: "Identité, préférences", href: "/profile", keywords: "compte" },
  { kind: "page", title: "Vault", detail: "Tes documents, protégés par Face ID", href: "/vault", keywords: "documents ordonnance compte rendu" },
  { kind: "page", title: "Annuaire", detail: "Trouver un praticien", href: "/directory", keywords: "médecin docteur" },
  { kind: "page", title: "Rendez-vous", detail: "Stevie appelle le cabinet", href: "/booking", keywords: "rdv prendre" },
  { kind: "page", title: "Rappels", detail: "SMS et appels", href: "/reminders", keywords: "médicament" },
  { kind: "page", title: "Messagerie", detail: "Ton adresse Stevie", href: "/inbox", keywords: "email mail" },
];

// Titles only: document content stays behind the Vault lock.
const documents: readonly SearchEntry[] = [
  { kind: "document", title: "Lettre de rendez-vous", detail: "Cabinet médical · 27 novembre 2026", href: "/vault" },
];

export function baseSearchEntries(): readonly SearchEntry[] {
  return [
    ...pages,
    ...demoChallenges.map((challenge) => ({
      kind: "challenge" as const,
      title: challenge.title,
      detail: `${challenge.goal} · ${challenge.days} jours`,
      href: `/challenges?join=${challenge.id}`,
      keywords: challenge.partner.name,
    })),
    ...demoPeople
      .filter((person) => demoInitialFriends.includes(person.id))
      .map((person) => ({
        kind: "friend" as const,
        title: person.name,
        detail: `Ami·e · ${person.city}`,
        href: "/challenges?section=amis",
      })),
    ...demoPractitioners.map((item) => ({
      kind: "practitioner" as const,
      title: `${item.firstName} ${item.lastName}`,
      detail: `${item.specialtyLabel} · ${item.address.postalCode}`,
      href: "/directory",
    })),
    ...documents,
  ];
}

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Every word of the query must appear. A title hit ranks above a detail hit.
export function searchApp(query: string, entries: readonly SearchEntry[]): readonly SearchEntry[] {
  const words = normalize(query).split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [];
  const scored = entries.flatMap((entry) => {
    const title = normalize(entry.title);
    const haystack = `${title} ${normalize(entry.detail)} ${normalize(entry.keywords ?? "")}`;
    if (!words.every((word) => haystack.includes(word))) return [];
    const score = words.reduce(
      (sum, word) => sum + (title.startsWith(word) ? 3 : title.includes(word) ? 2 : 1),
      0,
    );
    return [{ entry, score }];
  });
  return scored.sort((a, b) => b.score - a.score).map((item) => item.entry);
}

export function groupResults(
  results: readonly SearchEntry[],
): readonly { readonly kind: SearchKind; readonly items: readonly SearchEntry[] }[] {
  const order: readonly SearchKind[] = ["page", "challenge", "friend", "practitioner", "document"];
  return order
    .map((kind) => ({ kind, items: results.filter((item) => item.kind === kind) }))
    .filter((group) => group.items.length > 0);
}
