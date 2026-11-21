import type { AvatarDefinition } from "open-bot-avatar";
import raw from "./marmot.json" with { type: "json" };

if (raw.version !== 1) {
  throw new Error("marmot.json version must be 1");
}

export const marmot = {
  ...raw,
  version: raw.version,
} satisfies AvatarDefinition;
