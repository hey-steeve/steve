const crossBoundaryLabel = "cross-boundary";
const listedFileCount = 5;

export type CrossBoundaryInput = {
  readonly files: readonly string[];
  readonly labels: readonly string[];
};

export function crossBoundaryFailure(
  input: CrossBoundaryInput,
): string | undefined {
  if (input.labels.includes(crossBoundaryLabel)) {
    return undefined;
  }
  const appFiles = unique(input.files.filter((file) => isInTree(file, "app")));
  const sharedFiles = unique(
    input.files.filter((file) => isInTree(file, "shared")),
  );
  if (appFiles.length === 0 || sharedFiles.length === 0) {
    return undefined;
  }
  return failureMessage(appFiles, sharedFiles);
}

function isInTree(file: string, tree: "app" | "shared"): boolean {
  return file === tree || file.startsWith(`${tree}/`);
}

function unique(files: readonly string[]): string[] {
  return [...new Set(files)];
}

function listFiles(files: readonly string[]): string {
  const shown = files.slice(0, listedFileCount);
  const hidden = files.length - shown.length;
  const lines = shown.map((file) => `- ${file}`);
  if (hidden > 0) {
    lines.push(`- and ${hidden} more`);
  }
  return lines.join("\n");
}

function failureMessage(
  appFiles: readonly string[],
  sharedFiles: readonly string[],
): string {
  return [
    "This pull request changes both app/ and shared/.",
    "",
    "app/:",
    listFiles(appFiles),
    "",
    "shared/:",
    listFiles(sharedFiles),
    "",
    "Split the pull request so app/ and shared/ change in separate pull requests. If the mix is intentional, add the cross-boundary label.",
  ].join("\n");
}

export function parseLabelList(raw: string): readonly string[] {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "null") {
    return [];
  }
  return parseJsonLabelList(trimmed).map((label) => label.trim());
}

function parseJsonLabelList(raw: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`PR_LABELS is not a JSON array of strings. ${reason}`);
  }
  if (!isStringArray(parsed)) {
    throw new Error("PR_LABELS is not a JSON array of strings.");
  }
  return parsed;
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
