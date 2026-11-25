// Fails when the client bundle could expose the xAI API key.
// Usage: node tooling/check-voice-client-bundle.mjs [dir]. Default: app/.next/static.
// Reports the kind of leak and the file only, never the matched text.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const checks = [
  { kind: "key name", test: (text) => text.includes("XAI_API_KEY") },
  // xAI keys start with "xai-". The tests use a synthetic canary with the same prefix.
  { kind: "key value", test: (text) => /xai-[A-Za-z0-9_-]{16,}/.test(text) },
];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

export function scanBundle(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { missing: true, findings: [] };
  }
  const findings = [];
  for (const file of walk(dir)) {
    const text = readFileSync(file, "latin1");
    for (const check of checks) {
      if (check.test(text)) {
        findings.push({ kind: check.kind, file: path.relative(dir, file) });
      }
    }
  }
  return { missing: false, findings };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] ?? path.join(repo, "app/.next/static"));
  const result = scanBundle(dir);
  if (result.missing) {
    process.stderr.write("voice bundle check: scan directory is missing. Build the app first.\n");
    process.exit(1);
  }
  for (const finding of result.findings) {
    process.stderr.write(`voice bundle check: ${finding.kind} found in ${finding.file}\n`);
  }
  process.exit(result.findings.length === 0 ? 0 : 1);
}
