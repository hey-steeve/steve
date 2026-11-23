import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createStaging, publishStaging, removeStaleStaging } from "./stage-publish";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourceRoot = path.resolve(appDir, "../shared/assets/mascot");
const defaultPublicDir = path.join(appDir, "public");
const profileSource = "avatar/pfp-lavender-profile.png";
const profileBackground = "#daddfe";

export interface MascotAppIconTarget {
  readonly publicDir: string;
  readonly sourceRoot: string;
}

export const mascotAppIcons = [
  { file: "favicon-16.png", size: 16, rounded: true },
  { file: "favicon-32.png", size: 32, rounded: true },
  { file: "apple-touch-icon.png", size: 180, rounded: true },
  { file: "app-192.png", size: 192, rounded: true },
  { file: "app-512.png", size: 512, rounded: true },
  { file: "app-maskable-512.png", size: 512, maskable: true },
] as const;

export async function syncMascotAppIcons(
  target?: MascotAppIconTarget,
): Promise<void> {
  const publicDir = target?.publicDir ?? defaultPublicDir;
  const sourceRoot = target?.sourceRoot ?? defaultSourceRoot;
  const source = path.join(sourceRoot, profileSource);
  if (!existsSync(source)) {
    throw new Error(`Missing mascot source ${source}`);
  }

  removeStaleStaging(publicDir, "app-icons.tmp-");
  const staging = createStaging(publicDir, "app-icons.tmp-");
  try {
    await Promise.all(
      mascotAppIcons.map(async (icon) => {
        if ("maskable" in icon) {
          const inset = Math.round(icon.size * 0.72);
          const image = await sharp(source)
            .resize(inset, inset, { fit: "cover" })
            .png()
            .toBuffer();
          const background = Buffer.from(
            `<svg width="${icon.size}" height="${icon.size}"><rect width="100%" height="100%" fill="${profileBackground}"/></svg>`,
          );
          await sharp(background)
            .composite([
              {
                input: image,
                left: Math.floor((icon.size - inset) / 2),
                top: Math.floor((icon.size - inset) / 2),
              },
            ])
            .png()
            .toFile(path.join(staging, icon.file));
          return;
        }

        const mask = Buffer.from(
          `<svg width="${icon.size}" height="${icon.size}"><rect width="100%" height="100%" rx="${Math.round(icon.size * 0.22)}" fill="white"/></svg>`,
        );
        await sharp(source)
          .resize(icon.size, icon.size, { fit: "cover" })
          .composite([{ input: mask, blend: "dest-in" }])
          .png()
          .toFile(path.join(staging, icon.file));
      }),
    );
    publishStaging(staging, path.join(publicDir, "app-icons"));
    pointManifestAtMascotIcons(publicDir);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function pointManifestAtMascotIcons(publicDir: string): void {
  const manifestPath = path.join(publicDir, "icons", "site.webmanifest");
  if (!existsSync(manifestPath)) {
    return;
  }
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Invalid site.webmanifest");
  }
  Object.assign(manifest, {
    icons: [
      {
        src: "/app-icons/app-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/app-icons/app-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/app-icons/app-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
