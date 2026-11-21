import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const stagingStaleMs = 15 * 60 * 1000;

export function removeStaleStaging(
  publicDir: string,
  prefix: string,
  now = Date.now(),
): void {
  if (!existsSync(publicDir)) {
    return;
  }
  for (const name of readdirSync(publicDir)) {
    if (!name.startsWith(prefix)) {
      continue;
    }
    const dir = path.join(publicDir, name);
    let mtimeMs: number;
    try {
      const stat = statSync(dir);
      if (!stat.isDirectory()) {
        continue;
      }
      mtimeMs = stat.mtimeMs;
    } catch {
      continue;
    }
    if (now - mtimeMs < stagingStaleMs) {
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

export function createStaging(publicDir: string, prefix: string): string {
  const dir = path.join(publicDir, `${prefix}${process.pid}-${crypto.randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function publishStaging(staging: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  const names = readdirSync(staging);
  for (const name of names) {
    renameSync(path.join(staging, name), path.join(destDir, name));
  }
  const keep = new Set(names);
  for (const name of readdirSync(destDir)) {
    if (keep.has(name)) {
      continue;
    }
    rmSync(path.join(destDir, name), { recursive: true, force: true });
  }
}
