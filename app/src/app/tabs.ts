// Plain module (no "use client") so server components can ask whether a
// route is a tab without crossing the client boundary.
export const appTabs = [
  { href: "/chat", label: "Home" },
  { href: "/challenges", label: "Challenges" },
  { href: "/agenda", label: "Calendar" },
  { href: "/profile", label: "My profile" },
] as const;

export function tabIndexFor(current: string): number | null {
  const index = appTabs.findIndex((tab) => tab.href === current);
  return index < 0 ? null : index;
}

export function isTabRoute(current: string): boolean {
  return tabIndexFor(current) !== null;
}
