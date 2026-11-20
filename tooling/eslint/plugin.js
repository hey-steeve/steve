import fs from "node:fs";
import path from "node:path";

const featureMessage =
  "Features must not import other features. Put the shared type or helper in shared/ (in its own PR) and import it from @steve/shared.";

const sharedMessage =
  "shared/ must not import features. Put shared types and helpers in shared/ and let features import them from @steve/shared.";

const consoleMessage =
  "Do not use console. Use log() from @steve/shared/logger.";

function repoRoot(filename) {
  let dir = path.resolve(path.dirname(filename));
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return path.resolve();
    }
    dir = parent;
  }
}

function locate(filename) {
  const root = repoRoot(filename);
  const relative = path.relative(root, path.resolve(filename));
  const portable = relative.split(path.sep).join("/");
  if (portable === ".." || portable.startsWith("../")) {
    return { kind: "other", name: "" };
  }
  const feature = /^features\/([^/]+)(?:\/|$)/.exec(portable);
  if (feature?.[1]) {
    return { kind: "feature", name: feature[1] };
  }
  if (portable === "shared" || portable.startsWith("shared/")) {
    return { kind: "shared", name: "shared" };
  }
  return { kind: "other", name: "" };
}

function samePackage(left, right) {
  return (
    left.kind !== "other" && left.kind === right.kind && left.name === right.name
  );
}

function boundaryMessage(location, source, filename) {
  if (location.kind === "other") {
    return null;
  }

  if (source.startsWith(".")) {
    const resolved = path.resolve(path.dirname(filename), source);
    const target = locate(resolved);
    if (samePackage(location, target)) {
      return null;
    }
    return location.kind === "feature" ? featureMessage : sharedMessage;
  }

  if (source !== "@steve" && !source.startsWith("@steve/")) {
    return null;
  }

  const packageName =
    source === "@steve" ? "" : source.slice("@steve/".length).split("/")[0];
  if (packageName === "shared") {
    return null;
  }
  return location.kind === "feature" ? featureMessage : sharedMessage;
}

function literalSource(node) {
  if (node && node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return null;
}

function reportImport(context, node, source) {
  const filename = context.filename ?? context.getFilename();
  const message = boundaryMessage(locate(filename), source, filename);
  if (message === null) {
    return;
  }
  context.report({ node, message });
}

const featureBoundary = {
  meta: {
    type: "problem",
    schema: [],
  },
  create(context) {
    function check(node) {
      const source = literalSource(node.source);
      if (source === null) {
        return;
      }
      reportImport(context, node.source, source);
    }

    return {
      ImportDeclaration: check,
      ExportAllDeclaration: check,
      ExportNamedDeclaration: check,
      ImportExpression(node) {
        const source = literalSource(node.source);
        if (source === null) {
          return;
        }
        reportImport(context, node.source, source);
      },
      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "require"
        ) {
          return;
        }
        const source = literalSource(node.arguments[0]);
        if (source === null) {
          return;
        }
        reportImport(context, node.arguments[0], source);
      },
      TSImportType(node) {
        const source = literalSource(node.source);
        if (source === null) {
          return;
        }
        reportImport(context, node.source, source);
      },
    };
  },
};

const noConsole = {
  meta: {
    type: "problem",
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type === "Identifier" &&
          node.object.name === "console"
        ) {
          context.report({ node, message: consoleMessage });
        }
      },
      Identifier(node) {
        if (node.name !== "console") {
          return;
        }
        if (
          node.parent &&
          node.parent.type === "MemberExpression" &&
          node.parent.object === node
        ) {
          return;
        }
        context.report({ node, message: consoleMessage });
      },
    };
  },
};

const plugin = {
  meta: { name: "steve" },
  rules: {
    "feature-boundary": featureBoundary,
    "no-console": noConsole,
  },
};

export default plugin;
