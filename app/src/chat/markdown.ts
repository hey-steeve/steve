import { createElement, Fragment, type ReactNode } from "react";

type Marker = "**" | "__" | "*" | "_";

type Inline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "bold"; readonly children: readonly Inline[] }
  | { readonly kind: "italic"; readonly children: readonly Inline[] };

type Block =
  | { readonly kind: "paragraph"; readonly lines: readonly string[] }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly items: readonly string[];
    };

const bulletPattern = /^[-*]\s+(.*)$/;
const orderedPattern = /^\d+[.)]\s+(.*)$/;

export function ChatMarkdown({ text }: { readonly text: string }) {
  return parseBlocks(text).map((block, index) => renderBlock(block, index));
}

function renderBlock(block: Block, key: number): ReactNode {
  if (block.kind === "list") {
    const items = block.items.map((item, index) =>
      createElement("li", { key: index }, renderInline(item, `${key}-${index}`)),
    );
    return createElement(block.ordered ? "ol" : "ul", { key }, items);
  }
  const children: ReactNode[] = [];
  for (let index = 0; index < block.lines.length; index += 1) {
    const line = block.lines[index];
    if (line === undefined) {
      continue;
    }
    if (index > 0) {
      children.push(createElement("br", { key: `${key}-br-${index}` }));
    }
    children.push(
      createElement(
        Fragment,
        { key: `${key}-line-${index}` },
        renderInline(line, `${key}-${index}`),
      ),
    );
  }
  return createElement("p", { key }, children);
}

function renderInline(input: string, prefix: string): ReactNode {
  return parseInline(input).map((node, index) => renderNode(node, `${prefix}-${index}`));
}

function renderNode(node: Inline, key: string): ReactNode {
  if (node.kind === "text") {
    return createElement(Fragment, { key }, node.text);
  }
  const children = node.children.map((child, index) =>
    renderNode(child, `${key}-${index}`),
  );
  const tag = node.kind === "bold" ? "strong" : "em";
  return createElement(tag, { key }, children);
}

function parseBlocks(source: string): readonly Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined || line.trim().length === 0) {
      index += 1;
      continue;
    }
    if (bulletPattern.test(line)) {
      const items = takeItems(lines, index, bulletPattern);
      blocks.push({ kind: "list", ordered: false, items });
      index += items.length;
      continue;
    }
    if (orderedPattern.test(line)) {
      const items = takeItems(lines, index, orderedPattern);
      blocks.push({ kind: "list", ordered: true, items });
      index += items.length;
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (
        current === undefined ||
        current.trim().length === 0 ||
        bulletPattern.test(current) ||
        orderedPattern.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }
    blocks.push({ kind: "paragraph", lines: paragraph });
  }
  return blocks;
}

function takeItems(
  lines: readonly string[],
  start: number,
  pattern: RegExp,
): readonly string[] {
  const items: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line === undefined ? null : pattern.exec(line);
    if (match === null) {
      break;
    }
    items.push(match[1] ?? "");
  }
  return items;
}

function parseInline(input: string): readonly Inline[] {
  const nodes: Inline[] = [];
  let buffer = "";
  let index = 0;
  while (index < input.length) {
    const marker = openerAt(input, index);
    const close =
      marker === null ? -1 : findCloser(input, index + marker.length, marker);
    if (marker !== null && close > index + marker.length) {
      if (buffer.length > 0) {
        nodes.push({ kind: "text", text: buffer });
        buffer = "";
      }
      const children = parseInline(input.slice(index + marker.length, close));
      nodes.push(
        marker.length === 2
          ? { kind: "bold", children }
          : { kind: "italic", children },
      );
      index = close + marker.length;
      continue;
    }
    buffer += input.charAt(index);
    index += 1;
  }
  if (buffer.length > 0) {
    nodes.push({ kind: "text", text: buffer });
  }
  return nodes;
}

function openerAt(input: string, index: number): Marker | null {
  const marker = markerAt(input, index);
  if (marker === null) {
    return null;
  }
  const after = input.charAt(index + marker.length);
  if (!isBoundary(input.charAt(index - 1)) || after.length === 0 || /\s/u.test(after)) {
    return null;
  }
  return marker;
}

function findCloser(input: string, from: number, marker: Marker): number {
  let index = from;
  while (index < input.length) {
    const found = input.indexOf(marker, index);
    if (found === -1) {
      return -1;
    }
    if (marker.length === 1 && input.startsWith(`${marker}${marker}`, found)) {
      index = found + 2;
      continue;
    }
    const before = input.charAt(found - 1);
    const after = input.charAt(found + marker.length);
    if (!/\s/u.test(before) && isBoundary(after)) {
      return found;
    }
    index = found + marker.length;
  }
  return -1;
}

function markerAt(input: string, index: number): Marker | null {
  if (input.startsWith("**", index)) {
    return "**";
  }
  if (input.startsWith("__", index)) {
    return "__";
  }
  const char = input.charAt(index);
  if (char === "*" || char === "_") {
    return char;
  }
  return null;
}

function isBoundary(char: string): boolean {
  return char.length === 0 || /[^\p{L}\p{N}]/u.test(char);
}
