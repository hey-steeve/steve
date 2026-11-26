const encoder = new TextEncoder();

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
