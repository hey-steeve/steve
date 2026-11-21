import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.resolve(appDir, "../shared/assets/brand");
const publicDir = path.join(appDir, "public");
const destDir = path.join(publicDir, "icons");

const unpublished = new Set(["README.md", "SHA256SUMS"]);

function clearStaging(): void {
  if (!existsSync(publicDir)) {
    return;
  }
  for (const name of readdirSync(publicDir)) {
    if (name.startsWith("icons.tmp-")) {
      rmSync(path.join(publicDir, name), { recursive: true, force: true });
    }
  }
}

export function syncBrandIcons(): void {
  clearStaging();
  const staging = path.join(publicDir, `icons.tmp-${process.pid}-${Date.now()}`);
  mkdirSync(staging, { recursive: true });
  let copied = 0;
  for (const name of readdirSync(sourceDir)) {
    if (unpublished.has(name)) {
      continue;
    }
    cpSync(path.join(sourceDir, name), path.join(staging, name));
    copied += 1;
  }
  if (copied === 0) {
    rmSync(staging, { recursive: true, force: true });
    throw new Error(`No brand icons in ${sourceDir}`);
  }
  rmSync(destDir, { recursive: true, force: true });
  renameSync(staging, destDir);
}
