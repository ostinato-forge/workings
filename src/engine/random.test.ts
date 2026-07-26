import { describe, expect, test } from "vitest";
import { drawIndex, mulberry32, randInt, shuffled } from "./random";

test("same seed gives identical streams", () => {
  const a = mulberry32(64);
  const b = mulberry32(64);
  const streamA = [a(), a(), a(), a(), a()];
  const streamB = [b(), b(), b(), b(), b()];
  expect(streamA).toEqual(streamB);
});

test("different seeds give different streams", () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
});

test("values stay in [0, 1)", () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 1000; i += 1) {
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("randInt covers the full range and respects bounds", () => {
  const rng = mulberry32(9);
  const seen = new Set<number>();
  for (let i = 0; i < 500; i += 1) {
    const v = randInt(rng, 4);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(4);
    seen.add(v);
  }
  expect(seen.size).toBe(4);
});

// A failure here means the RNG stream changed and all stored artifacts
// must be regenerated.
test("stream golden values for seed 42 stay fixed", () => {
  const rng = mulberry32(42);
  expect([rng(), rng(), rng(), rng(), rng()]).toEqual([
    0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
    0.6697340414393693, 0.17481389874592423,
  ]);
});

test("deep stream golden values for seed 64 stay fixed", () => {
  const rng = mulberry32(64);
  const values: number[] = [];
  for (let index = 0; index <= 99999; index += 1) {
    const value = rng();
    if (index === 0 || index === 999 || index === 99999) {
      values.push(value);
    }
  }
  expect(values).toEqual([
    0.8459169301204383,
    0.07847114000469446,
    0.6960705448873341,
  ]);
});

test("shuffled is deterministic and preserves elements", () => {
  const rng1 = mulberry32(3);
  const rng2 = mulberry32(3);
  const items = ["a", "b", "c", "d", "e"];
  const s1 = shuffled(rng1, items);
  const s2 = shuffled(rng2, items);
  expect(s1).toEqual(s2);
  expect([...s1].sort()).toEqual([...items].sort());
  expect(items).toEqual(["a", "b", "c", "d", "e"]);
});

describe("drawIndex", () => {
  test("walks the cumulative distribution with one draw", () => {
    expect(drawIndex(() => 0.6, [0.5, 0.3, 0.2])).toBe(1);
    expect(drawIndex(() => 0.95, [0.5, 0.3, 0.2])).toBe(2);
    expect(drawIndex(() => 0.1, [0.5, 0.3, 0.2])).toBe(0);
  });

  test("never lands on a zero-probability entry", () => {
    expect(drawIndex(() => 0, [0, 1])).toBe(1);
    for (let seed = 1; seed <= 200; seed += 1) {
      expect(drawIndex(mulberry32(seed), [0, 0.5, 0, 0.5])).not.toBe(0);
    }
  });

  test("returns the last index on floating-point residue", () => {
    expect(drawIndex(() => 0.999999999, [0.3, 0.3, 0.3])).toBe(2);
  });

  test("is roughly balanced over a fair distribution", () => {
    const rng = mulberry32(11);
    let zeros = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (drawIndex(rng, [0.5, 0.5]) === 0) zeros += 1;
    }
    expect(zeros).toBeGreaterThan(400);
    expect(zeros).toBeLessThan(600);
  });
});
