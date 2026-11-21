import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStaging, publishStaging, removeStaleStaging } from "./stage-publish";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSourceDir = path.resolve(appDir, "../shared/assets/brand");
const defaultPublicDir = path.join(appDir, "public");

const unpublished = new Set(["README.md", "SHA256SUMS"]);

export interface BrandSyncTarget {
  readonly publicDir: string;
  readonly sourceDir: string;
}

function brandIconNames(sourceDir: string): readonly string[] {
  if (!existsSync(sourceDir)) {
    throw new Error(`No brand icons in ${sourceDir}`);
  }
  const names = readdirSync(sourceDir).filter((name) => !unpublished.has(name));
  if (names.length === 0) {
    throw new Error(`No brand icons in ${sourceDir}`);
  }
  return names;
}

export function syncBrandIcons(target?: BrandSyncTarget): void {
  const publicDir = target?.publicDir ?? defaultPublicDir;
  const sourceDir = target?.sourceDir ?? defaultSourceDir;
  const names = brandIconNames(sourceDir);
  removeStaleStaging(publicDir, "icons.tmp-");
  const staging = createStaging(publicDir, "icons.tmp-");
  try {
    for (const name of names) {
      cpSync(path.join(sourceDir, name), path.join(staging, name));
    }
    publishStaging(staging, path.join(publicDir, "icons"));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
