import { expect, test } from "vitest";
import { mulberry32 } from "./random";
import { sampleFromLogits } from "./sampling";

const logits = [2.0, 1.0, 0.5, -1.0];

test("temperature zero is argmax, always", () => {
  const rng = mulberry32(64);
  for (let i = 0; i < 50; i += 1) {
    expect(sampleFromLogits(logits, { temperature: 0 }, rng)).toBe(0);
  }
});

test("higher temperature spreads choices over more tokens", () => {
  const count = (temperature: number): number => {
    const rng = mulberry32(64);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i += 1) {
      seen.add(sampleFromLogits(logits, { temperature }, rng));
    }
    return seen.size;
  };
  expect(count(0.2)).toBeLessThanOrEqual(count(2.0));
  expect(count(2.0)).toBeGreaterThanOrEqual(3);
});

test("topK restricts to the k best logits", () => {
  const rng = mulberry32(64);
  for (let i = 0; i < 200; i += 1) {
    const pick = sampleFromLogits(logits, { temperature: 2, topK: 2 }, rng);
    expect([0, 1]).toContain(pick);
  }
});

test("topP keeps the smallest prefix covering the mass", () => {
  const rng = mulberry32(64);
  // with these logits the top token holds well over half the mass
  for (let i = 0; i < 200; i += 1) {
    const pick = sampleFromLogits(logits, { temperature: 1, topP: 0.5 }, rng);
    expect(pick).toBe(0);
  }
});

test("identical seeds reproduce identical samples", () => {
  const a = mulberry32(9);
  const b = mulberry32(9);
  const seqA = Array.from({ length: 20 }, () =>
    sampleFromLogits(logits, { temperature: 1.5 }, a),
  );
  const seqB = Array.from({ length: 20 }, () =>
    sampleFromLogits(logits, { temperature: 1.5 }, b),
  );
  expect(seqA).toEqual(seqB);
});
