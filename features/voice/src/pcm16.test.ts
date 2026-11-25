import { decodePcm16, encodePcm16 } from "./index.ts";
import { expect, it } from "vitest";

it("encodes fixture vectors as little-endian int16", () => {
  const bytes = encodePcm16(new Float32Array([0, 1, -1, 0.5]));
  expect(Array.from(bytes)).toEqual([0x00, 0x00, 0xff, 0x7f, 0x00, 0x80, 0x00, 0x40]);
});

it("clamps out-of-range samples", () => {
  expect(Array.from(encodePcm16(new Float32Array([2, -3])))).toEqual([0xff, 0x7f, 0x00, 0x80]);
});

it("decodes fixture vectors", () => {
  const out = decodePcm16(new Uint8Array([0xff, 0x7f, 0x00, 0x80, 0x00, 0x00]));
  expect(Array.from(out)).toEqual([1, -1, 0]);
});

it("ignores an odd trailing byte", () => {
  expect(decodePcm16(new Uint8Array([0xff, 0x7f, 0x12])).length).toBe(1);
  expect(decodePcm16(new Uint8Array([1])).length).toBe(0);
});

it("decodes from a subarray view with an offset", () => {
  const src = new Uint8Array([9, 0xff, 0x7f, 9]);
  expect(Array.from(decodePcm16(src.subarray(1, 3)))).toEqual([1]);
});

it("round-trips close to the input", () => {
  const input = Float32Array.from({ length: 64 }, (_, i) => Math.sin(i / 5) * 0.9);
  const out = decodePcm16(encodePcm16(input));
  expect(out.length).toBe(input.length);
  out.forEach((v, i) => {
    expect(Number.isFinite(v)).toBe(true);
    expect(Math.abs(v - (input[i] ?? 0))).toBeLessThan(1e-4);
  });
});
