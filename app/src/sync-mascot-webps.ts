import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(appDir, "../shared/assets/mascot");
const publicDir = path.join(appDir, "public");
const destDir = path.join(publicDir, "mascot");

export const mascotWebps = [
  {
    file: "pfp-lavender.webp",
    source: "avatar/pfp-lavender.png",
    width: 192,
    height: 192,
  },
  { file: "shrug.webp", source: "body/shrug.png", height: 640 },
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

function clearStaging(): void {
  if (!existsSync(publicDir)) {
    return;
  }
  for (const name of readdirSync(publicDir)) {
    if (name.startsWith("mascot.tmp-")) {
      rmSync(path.join(publicDir, name), { recursive: true, force: true });
    }
  }
}

export async function syncMascotWebps(): Promise<void> {
  clearStaging();
  const staging = path.join(publicDir, `mascot.tmp-${process.pid}-${Date.now()}`);
  mkdirSync(staging, { recursive: true });
  try {
    await Promise.all(
      mascotWebps.map(async (item) => {
        const resize =
          "width" in item
            ? {
                width: item.width,
                height: item.height,
                fit: "cover" as const,
              }
            : {
                height: item.height,
                fit: "inside" as const,
                withoutEnlargement: true,
              };
        await sharp(path.join(sourceRoot, item.source))
          .resize(resize)
          .webp({ quality: 80, alphaQuality: 80, effort: 4 })
          .toFile(path.join(staging, item.file));
      }),
    );
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  rmSync(destDir, { recursive: true, force: true });
  renameSync(staging, destDir);
}
