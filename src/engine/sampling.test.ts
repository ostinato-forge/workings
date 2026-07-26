import { describe, expect, test } from "vitest";
import { mulberry32 } from "./random";
import { sampleDescribed, sampleFromLogits } from "./sampling";

const logits = [2.0, 1.0, 0.5, -1.0];

test("temperature zero is argmax, always", () => {
  const rng = mulberry32(64);
  for (let i = 0; i < 50; i += 1) {
    expect(sampleFromLogits(logits, { temperature: 0 }, rng)).toBe(0);
  }
});

test.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.1])(
  "rejects invalid temperature %s",
  (temperature) => {
    expect(() =>
      sampleFromLogits(logits, { temperature }, mulberry32(64)),
    ).toThrow("temperature must be a finite non-negative number");
  },
);

test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid topK %s",
  (topK) => {
    expect(() =>
      sampleFromLogits(logits, { temperature: 1, topK }, mulberry32(64)),
    ).toThrow("topK must be a positive integer");
  },
);

test.each([0, -0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
  "rejects invalid topP %s",
  (topP) => {
    expect(() =>
      sampleFromLogits(logits, { temperature: 1, topP }, mulberry32(64)),
    ).toThrow("topP must be greater than 0 and at most 1");
  },
);

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

describe("sampleDescribed", () => {
  const logits = [2.0, 1.0, 0.5, -1.0];

  test("agrees with sampleFromLogits on the same seed", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const config = { temperature: 0.8, topK: 3 };
      const direct = sampleFromLogits(logits, config, mulberry32(seed));
      const described = sampleDescribed(logits, config, mulberry32(seed));
      expect(described.sampledIndex).toBe(direct);
    }
  });

  test("candidates are sorted by logit descending and cover every index", () => {
    const { candidates } = sampleDescribed(
      logits,
      { temperature: 1 },
      mulberry32(1),
    );
    expect(candidates.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    expect(candidates).toHaveLength(logits.length);
  });

  test("probFull sums to one and survivors' probSampled sums to one", () => {
    const { candidates } = sampleDescribed(
      logits,
      { temperature: 0.7, topK: 2 },
      mulberry32(1),
    );
    const fullMass = candidates.reduce((s, c) => s + c.probFull, 0);
    const sampledMass = candidates.reduce((s, c) => s + c.probSampled, 0);
    expect(fullMass).toBeCloseTo(1, 10);
    expect(sampledMass).toBeCloseTo(1, 10);
    for (const c of candidates) {
      if (!c.survived) expect(c.probSampled).toBe(0);
    }
  });

  test("topK marks exactly k survivors", () => {
    const { candidates } = sampleDescribed(
      logits,
      { temperature: 1, topK: 2 },
      mulberry32(1),
    );
    expect(candidates.filter((c) => c.survived)).toHaveLength(2);
    expect(candidates.filter((c) => c.survived).map((c) => c.index)).toEqual([
      0, 1,
    ]);
  });

  test("topP keeps the smallest prefix whose mass reaches the threshold", () => {
    const { candidates } = sampleDescribed(
      logits,
      { temperature: 1, topP: 0.5 },
      mulberry32(1),
    );
    const survivors = candidates.filter((c) => c.survived);
    expect(survivors.length).toBeGreaterThanOrEqual(1);
    expect(survivors.length).toBeLessThan(candidates.length);
    const sortedSurvived = candidates
      .slice(0, survivors.length)
      .every((c) => c.survived);
    expect(sortedSurvived).toBe(true);
  });

  test("the sampled index is always a survivor", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const result = sampleDescribed(
        logits,
        { temperature: 1.2, topP: 0.8 },
        mulberry32(seed),
      );
      const winner = result.candidates.find(
        (c) => c.index === result.sampledIndex,
      );
      expect(winner?.survived).toBe(true);
    }
  });

  test("temperature 0 consumes no randomness and picks the argmax", () => {
    const throwingRng = () => {
      throw new Error("rng must not be consumed at temperature 0");
    };
    const result = sampleDescribed(logits, { temperature: 0 }, throwingRng);
    expect(result.sampledIndex).toBe(0);
    const argmax = result.candidates[0];
    expect(argmax?.survived).toBe(true);
    expect(argmax?.probSampled).toBe(1);
    expect(argmax?.probFull).toBe(1);
    expect(result.candidates.slice(1).every((c) => !c.survived)).toBe(true);
  });
});
