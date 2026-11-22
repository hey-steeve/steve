import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createStaging, publishStaging, removeStaleStaging } from "./stage-publish";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourceRoot = path.resolve(appDir, "../shared/assets/mascot");
const defaultPublicDir = path.join(appDir, "public");

export interface MascotSyncTarget {
  readonly publicDir: string;
  readonly sourceRoot: string;
}

export const mascotWebps = [
  {
    file: "pfp-lavender-profile.webp",
    source: "avatar/pfp-lavender-profile.png",
    width: 192,
    height: 192,
  },
  { file: "bubbles.webp", source: "body/bubbles.png", lossless: true },
  {
    file: "state-calling.webp",
    source: "states/calling.png",
    width: 256,
    height: 256,
  },
  {
    file: "state-done.webp",
    source: "states/done.png",
    width: 256,
    height: 256,
  },
  {
    file: "state-listening.webp",
    source: "states/listening.png",
    width: 256,
    height: 256,
  },
  {
    file: "state-thinking.webp",
    source: "states/thinking.png",
    width: 256,
    height: 256,
  },
  {
    file: "state-urgent.webp",
    source: "states/urgent.png",
    width: 256,
    height: 256,
  },
] as const;

function assertMascotSources(sourceRoot: string): void {
  for (const item of mascotWebps) {
    const source = path.join(sourceRoot, item.source);
    if (!existsSync(source)) {
      throw new Error(`Missing mascot source ${source}`);
    }
  }
}

export async function syncMascotWebps(target?: MascotSyncTarget): Promise<void> {
  const publicDir = target?.publicDir ?? defaultPublicDir;
  const sourceRoot = target?.sourceRoot ?? defaultSourceRoot;
  assertMascotSources(sourceRoot);
  removeStaleStaging(publicDir, "mascot.tmp-");
  const staging = createStaging(publicDir, "mascot.tmp-");
  try {
    await Promise.all(
      mascotWebps.map(async (item) => {
        let image = sharp(path.join(sourceRoot, item.source));
        if ("width" in item) {
          image = image.resize({
            width: item.width,
            height: item.height,
            fit: "cover",
          });
        }
        const webp =
          "lossless" in item
            ? { lossless: true as const }
            : { quality: 80, alphaQuality: 80, effort: 4 };
        await image.webp(webp).toFile(path.join(staging, item.file));
      }),
    );
    publishStaging(staging, path.join(publicDir, "mascot"));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
