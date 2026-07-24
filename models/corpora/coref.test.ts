import { expect, test } from "vitest";
import { FEMALE_NAMES, MALE_NAMES, generateCorpus } from "./coref";

test("generation is deterministic per seed", () => {
  const a = generateCorpus(64);
  const b = generateCorpus(64);
  expect(a.train).toEqual(b.train);
  expect(a.heldOut).toEqual(b.heldOut);
});

test("pronoun gender always matches its referent name", () => {
  const { train, heldOut } = generateCorpus(64);
  for (const line of [...train, ...heldOut]) {
    const words = line.split(" ");
    const pronounIndex = words.findIndex((w) => w === "she" || w === "he");
    expect(pronounIndex).toBeGreaterThan(0);
    const pronoun = words[pronounIndex];
    const namesInLine = words.filter(
      (w) => FEMALE_NAMES.includes(w) || MALE_NAMES.includes(w),
    );
    const referent = namesInLine[0];
    expect(referent).toBeDefined();
    const expectedPronoun = FEMALE_NAMES.includes(referent as string)
      ? "she"
      : "he";
    expect(pronoun).toBe(expectedPronoun);
  }
});

test("distractor lines contain a second name of the opposite gender", () => {
  const { train } = generateCorpus(64);
  const withDistractor = train.filter((line) => {
    const words = line.split(" ");
    const names = words.filter(
      (w) => FEMALE_NAMES.includes(w) || MALE_NAMES.includes(w),
    );
    return names.length === 2;
  });
  expect(withDistractor.length).toBeGreaterThan(train.length * 0.3);
  for (const line of withDistractor) {
    const words = line.split(" ");
    const names = words.filter(
      (w) => FEMALE_NAMES.includes(w) || MALE_NAMES.includes(w),
    );
    const genders = names.map((n) =>
      FEMALE_NAMES.includes(n as string) ? "f" : "m",
    );
    expect(new Set(genders).size).toBe(2);
  }
});

test("held-out lines never appear in training", () => {
  const { train, heldOut } = generateCorpus(64);
  const trainSet = new Set(train);
  for (const line of heldOut) {
    expect(trainSet.has(line)).toBe(false);
  }
  expect(heldOut.length).toBeGreaterThanOrEqual(200);
  expect(train.length).toBeGreaterThanOrEqual(2000);
});
