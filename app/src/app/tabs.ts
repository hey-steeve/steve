// Plain module (no "use client") so server components can ask whether a
// route is a tab without crossing the client boundary.
export const appTabs = [
  { href: "/chat", label: "Accueil" },
  { href: "/challenges", label: "Défis" },
  { href: "/agenda", label: "Agenda" },
  { href: "/profile", label: "Mon profil" },
] as const;

export function tabIndexFor(current: string): number | null {
  const index = appTabs.findIndex((tab) => tab.href === current);
  return index < 0 ? null : index;
}

export function isTabRoute(current: string): boolean {
  return tabIndexFor(current) !== null;
}
