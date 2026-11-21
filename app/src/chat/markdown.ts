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
      readonly ordered: false;
      readonly items: readonly string[];
    }
  | {
      readonly kind: "list";
      readonly ordered: true;
      readonly start: number;
      readonly items: readonly string[];
    };

const bulletPattern = /^[-*]\s+(.*)$/;
const orderedPattern = /^(\d+)[.)]\s+(.*)$/;

export function ChatMarkdown({ text }: { readonly text: string }) {
  return parseBlocks(text).map((block, index) => renderBlock(block, index));
}

function renderBlock(block: Block, key: number): ReactNode {
  if (block.kind === "list") {
    const items = block.items.map((item, index) =>
      createElement("li", { key: index }, renderInline(item, `${key}-${index}`)),
    );
    if (!block.ordered) {
      return createElement("ul", { key }, items);
    }
    if (block.start === 1) {
      return createElement("ol", { key }, items);
    }
    return createElement("ol", { key, start: block.start }, items);
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
      blocks.push({
        kind: "list",
        ordered: true,
        start: orderedStart(line),
        items,
      });
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

function orderedStart(line: string): number {
  const match = orderedPattern.exec(line);
  const digits = match?.[1];
  if (digits === undefined) {
    return 1;
  }
  const start = Number.parseInt(digits, 10);
  if (!Number.isFinite(start)) {
    return 1;
  }
  return start;
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
    items.push(match[match.length - 1] ?? "");
  }
  return items;
}

interface CloserTables {
  readonly star: Int32Array;
  readonly under: Int32Array;
  readonly stars: Int32Array;
  readonly unders: Int32Array;
}

function parseInline(input: string): readonly Inline[] {
  return parseInlineRange(input, 0, input.length, closerTables(input));
}

function parseInlineRange(
  input: string,
  start: number,
  end: number,
  tables: CloserTables,
): readonly Inline[] {
  const nodes: Inline[] = [];
  let buffer = "";
  let index = start;
  while (index < end) {
    const marker = openerInRange(input, index, end);
    const close =
      marker === null ? -1 : findCloser(tables, marker, index + marker.length, end);
    if (marker !== null && close > index + marker.length) {
      if (buffer.length > 0) {
        nodes.push({ kind: "text", text: buffer });
        buffer = "";
      }
      const children = parseInlineRange(
        input,
        index + marker.length,
        close,
        tables,
      );
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

function openerInRange(input: string, index: number, end: number): Marker | null {
  const marker = openerAt(input, index);
  if (marker === null || index + marker.length >= end) {
    return null;
  }
  return marker;
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

function closerTables(input: string): CloserTables {
  return {
    star: closerFrom(input, "*"),
    under: closerFrom(input, "_"),
    stars: closerFrom(input, "**"),
    unders: closerFrom(input, "__"),
  };
}

function closerFrom(input: string, marker: Marker): Int32Array {
  const length = input.length;
  const from = new Int32Array(length + 2);
  from[length] = -1;
  from[length + 1] = -1;
  const markerLength = marker.length;
  for (let index = length - 1; index >= 0; index -= 1) {
    if (!input.startsWith(marker, index)) {
      from[index] = from[index + 1] ?? -1;
      continue;
    }
    if (markerLength === 1 && input.startsWith(`${marker}${marker}`, index)) {
      from[index] = from[index + 2] ?? -1;
      continue;
    }
    const before = input.charAt(index - 1);
    const after = input.charAt(index + markerLength);
    if (!/\s/u.test(before) && isBoundary(after)) {
      from[index] = index;
      continue;
    }
    from[index] = from[index + markerLength] ?? -1;
  }
  return from;
}

function findCloser(
  tables: CloserTables,
  marker: Marker,
  start: number,
  end: number,
): number {
  const from = tableFor(tables, marker);
  const found = from[start] ?? -1;
  if (found < 0 || found + marker.length > end) {
    return -1;
  }
  return found;
}

function tableFor(tables: CloserTables, marker: Marker): Int32Array {
  if (marker === "*") {
    return tables.star;
  }
  if (marker === "_") {
    return tables.under;
  }
  if (marker === "**") {
    return tables.stars;
  }
  return tables.unders;
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
