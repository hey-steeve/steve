// Which home blocks show, and in what order. The person arranges them; the
// choice lives in this browser only.

export const homeBlocks = [
  { id: "signal", label: "Ton sommeil" },
  { id: "appointment", label: "Prochain rendez-vous" },
  { id: "challenge", label: "Défi" },
  { id: "space", label: "Mon espace santé" },
  { id: "upcoming", label: "À venir" },
  { id: "tiles", label: "Raccourcis" },
] as const;

export type HomeBlockId = (typeof homeBlocks)[number]["id"];

export type HomeLayout = {
  readonly order: readonly HomeBlockId[];
  readonly hidden: readonly HomeBlockId[];
};

export const defaultHomeLayout: HomeLayout = {
  order: homeBlocks.map((block) => block.id),
  hidden: [],
};

function isBlockId(value: unknown): value is HomeBlockId {
  return homeBlocks.some((block) => block.id === value);
}

// Keeps known ids once each, then appends blocks added since the save.
export function normalizeLayout(value: unknown): HomeLayout {
  if (typeof value !== "object" || value === null) return defaultHomeLayout;
  const rawOrder: unknown = Reflect.get(value, "order");
  const rawHidden: unknown = Reflect.get(value, "hidden");
  const order = Array.isArray(rawOrder) ? [...new Set(rawOrder.filter(isBlockId))] : [];
  for (const block of homeBlocks) if (!order.includes(block.id)) order.push(block.id);
  const hidden = Array.isArray(rawHidden) ? [...new Set(rawHidden.filter(isBlockId))] : [];
  return { order, hidden };
}

export function moveBlock(layout: HomeLayout, id: HomeBlockId, step: -1 | 1): HomeLayout {
  const from = layout.order.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= layout.order.length) return layout;
  const order = [...layout.order];
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { ...layout, order };
}

export function toggleBlock(layout: HomeLayout, id: HomeBlockId): HomeLayout {
  return layout.hidden.includes(id)
    ? { ...layout, hidden: layout.hidden.filter((item) => item !== id) }
    : { ...layout, hidden: [...layout.hidden, id] };
}

export function visibleBlocks(layout: HomeLayout): readonly HomeBlockId[] {
  return layout.order.filter((id) => !layout.hidden.includes(id));
}

const storageKey = "steve.home.layout.v1";

export function loadHomeLayout(): HomeLayout {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? defaultHomeLayout : normalizeLayout(JSON.parse(raw));
  } catch {
    return defaultHomeLayout;
  }
}

export function saveHomeLayout(layout: HomeLayout): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // Storage can be blocked; the layout still holds for this visit.
  }
}
