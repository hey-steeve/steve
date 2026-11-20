import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsc = path.join(root, "node_modules/typescript/lib/tsc.js");
const projects = [".", "tooling", "shared", "app"];
const appDir = path.join(root, "app");
const nextBin = path.join(appDir, "node_modules/next/dist/bin/next");

if (fs.existsSync(nextBin)) {
  const generated = spawnSync(process.execPath, [nextBin, "typegen"], {
    cwd: appDir,
    stdio: "inherit",
  });
  if (generated.status !== 0) {
    process.exit(generated.status === null ? 1 : generated.status);
  }
}

for (const entry of fs.readdirSync(path.join(root, "features"), {
  withFileTypes: true,
})) {
  if (entry.isDirectory()) {
    projects.push(path.posix.join("features", entry.name));
  }
}

for (const project of projects) {
  const result = spawnSync(process.execPath, [tsc, "--noEmit", "-p", project], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}
