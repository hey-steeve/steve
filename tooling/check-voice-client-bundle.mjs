// Fails when the client bundle could expose the xAI API key.
// Usage: node tooling/check-voice-client-bundle.mjs [dir]. Default: app/.next/static.
// Scans file contents and relative paths. Reports the kind of leak and the file only,
// never the matched text; path segments that match a rule are redacted.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
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
      yield { full, directory: true };
      yield* walk(full);
    } else if (entry.isFile()) {
      yield { full, directory: false };
    }
  }
}

function redactPath(relative) {
  return relative
    .split(path.sep)
    .map((segment) => (checks.some((check) => check.test(segment)) ? "[redacted]" : segment))
    .join("/");
}

const jsExtensions = new Set([".js", ".mjs", ".cjs"]);

export function scanBundle(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { missing: true, files: 0, jsFiles: 0, findings: [] };
  }
  const findings = [];
  let files = 0;
  let jsFiles = 0;
  const checkPath = (text, shown) => {
    for (const check of checks) {
      if (check.test(text)) {
        findings.push({ kind: `${check.kind} (in path)`, file: shown });
      }
    }
  };
  // The scan root is checked by its own name; the matched text is never printed.
  const rootName = path.basename(dir);
  checkPath(rootName, "[scan root]");
  for (const { full, directory } of walk(dir)) {
    const relative = path.relative(dir, full);
    const shown = redactPath(relative);
    checkPath(relative, shown);
    if (directory) {
      continue;
    }
    files += 1;
    if (jsExtensions.has(path.extname(full).toLowerCase())) {
      jsFiles += 1;
    }
    const text = readFileSync(full, "latin1");
    for (const check of checks) {
      if (check.test(text)) {
        findings.push({ kind: check.kind, file: shown });
      }
    }
  }
  return { missing: false, files, jsFiles, findings };
}

function isEntryPoint() {
  if (process.argv[1] === undefined) {
    return false;
  }
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  const dir = path.resolve(process.argv[2] ?? path.join(repo, "app/.next/static"));
  let result;
  try {
    result = scanBundle(dir);
  } catch {
    process.stderr.write("voice bundle check: file system error while scanning. Scan failed.\n");
    process.exit(1);
  }
  if (result.missing) {
    process.stderr.write("voice bundle check: scan directory is missing. Build the app first.\n");
    process.exit(1);
  }
  for (const finding of result.findings) {
    process.stderr.write(`voice bundle check: ${finding.kind} found in ${finding.file}\n`);
  }
  if (result.files === 0) {
    process.stderr.write("voice bundle check: no files were scanned. An empty directory is not a clean scan.\n");
    process.exit(1);
  }
  if (result.jsFiles === 0) {
    process.stderr.write("voice bundle check: no JavaScript assets were scanned. Build the app first.\n");
    process.exit(1);
  }
  process.exit(result.findings.length === 0 ? 0 : 1);
}
