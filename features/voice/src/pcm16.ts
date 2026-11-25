export function encodePcm16(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
  }
  return bytes;
}

export function decodePcm16(bytes: Uint8Array): Float32Array {
  const count = Math.floor(bytes.length / 2);
  const out = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * 2);
  for (let i = 0; i < count; i++) {
    const v = view.getInt16(i * 2, true);
    out[i] = v < 0 ? v / 0x8000 : v / 0x7fff;
  }
  return out;
}
