import { expect, it } from "vitest";
import {
  createInMemoryConversationStore,
  type ConversationSession,
} from "./index.js";

const session: ConversationSession = {
  id: "session-1",
  status: "active",
  version: 0,
  createdAt: "2026-11-23T14:00:00.000Z",
  updatedAt: "2026-11-23T14:00:00.000Z",
  turns: [
    {
      id: "assistant-1",
      role: "assistant",
      channel: "text",
      text: "Bonjour",
      createdAt: "2026-11-23T14:00:00.000Z",
    },
  ],
};

it("returns defensive copies of sessions and turns", async () => {
  const store = createInMemoryConversationStore([session]);
  const first = await store.get(session.id);
  if (first === null) {
    throw new Error("Missing session");
  }
  Reflect.set(first, "status", "completed");
  const firstTurn = first.turns[0];
  if (firstTurn !== undefined) {
    Reflect.set(firstTurn, "text", "Changed");
  }

  expect(await store.get(session.id)).toEqual(session);
});

it("enforces create and update versions", async () => {
  const store = createInMemoryConversationStore();
  await store.save(session, null);
  await expect(store.save(session, null)).rejects.toThrow("creation conflict");
  await expect(
    store.save({ ...session, version: 2 }, 0),
  ).rejects.toThrow("update conflict");

  const updated = {
    ...session,
    version: 1,
    updatedAt: "2026-11-23T14:01:00.000Z",
  };
  await store.save(updated, 0);
  expect(await store.get(session.id)).toEqual(updated);
  await expect(store.save({ ...updated, version: 2 }, 0)).rejects.toThrow(
    "update conflict",
  );
});

it("rejects duplicate initial sessions", () => {
  expect(() => createInMemoryConversationStore([session, session])).toThrow(
    "Duplicate initial conversation session",
  );
});
