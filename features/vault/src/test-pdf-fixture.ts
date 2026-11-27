import { deflateSync } from "node:zlib";

const encoder = new TextEncoder();

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function escapePdfString(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

export function syntheticPdf(
  pages: readonly string[],
): Uint8Array {
  const pageObjects = pages.map((_, index) => 4 + index * 2);
  const objects = new Map<number, string>();
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageObjects.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((text, index) => {
    const pageId = pageObjects[index];
    if (pageId === undefined) {
      return;
    }
    const contentId = pageId + 1;
    const chunks = text.match(/[\s\S]{1,80}/g) ?? [""];
    const textCommands = chunks
      .map((chunk) => `(${escapePdfString(chunk)}) Tj 0 -14 Td`)
      .join(" ");
    const commands = `BT /F1 12 Tf 72 720 Td ${textCommands} ET`;
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.set(
      contentId,
      `<< /Length ${encoder.encode(commands).byteLength} >>\nstream\n${commands}\nendstream`,
    );
  });

  let source = "%PDF-1.4\n% synthetic fixture\n";
  const offsets: number[] = [0];
  for (let id = 1; id <= objects.size; id += 1) {
    const body = objects.get(id);
    if (body === undefined) {
      throw new Error("PDF fixture has a missing object");
    }
    offsets[id] = encoder.encode(source).byteLength;
    source += `${id} 0 obj\n${body}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(source).byteLength;
  source += `xref\n0 ${objects.size + 1}\n`;
  source += "0000000000 65535 f \n";
  for (let id = 1; id <= objects.size; id += 1) {
    source += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  source += `trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\n`;
  source += `startxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(source);
}

export function syntheticCompressedOperatorPdf(
  operatorPairs: number,
): Uint8Array {
  const compressed = new Uint8Array(
    deflateSync(encoder.encode("q Q\n".repeat(operatorPairs))),
  );
  const objects = [
    encoder.encode("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"),
    encoder.encode("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"),
    encoder.encode(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj\n",
    ),
    concatenate([
      encoder.encode(
        `4 0 obj\n<< /Length ${compressed.byteLength} /Filter /FlateDecode >>\nstream\n`,
      ),
      compressed,
      encoder.encode("\nendstream\nendobj\n"),
    ]),
  ];
  const header = encoder.encode("%PDF-1.4\n% synthetic compressed fixture\n");
  const offsets: number[] = [0];
  let byteOffset = header.byteLength;
  for (const object of objects) {
    offsets.push(byteOffset);
    byteOffset += object.byteLength;
  }
  const xref = [
    "xref",
    "0 5",
    "0000000000 65535 f ",
    ...offsets.slice(1).map(
      (offset) => `${String(offset).padStart(10, "0")} 00000 n `,
    ),
    "trailer",
    "<< /Size 5 /Root 1 0 R >>",
    "startxref",
    String(byteOffset),
    "%%EOF",
    "",
  ].join("\n");
  return concatenate([header, ...objects, encoder.encode(xref)]);
}
