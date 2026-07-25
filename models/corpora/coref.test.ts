import { expect, test } from "vitest";
import { FEMALE_NAMES, MALE_NAMES, generateCorpus } from "./coref";

test("generation is deterministic per seed", () => {
  const a = generateCorpus(64);
  const b = generateCorpus(64);
  expect(a.train).toEqual(b.train);
  expect(a.heldOut).toEqual(b.heldOut);
});

test("metadata identifies varied referent positions with matching pronouns", () => {
  const { train, heldOut } = generateCorpus(64);
  const referentPositions = new Set<number>();
  for (const item of [...train, ...heldOut]) {
    const words = item.text.split(" ");
    const pronounIndex = words.findIndex((w) => w === "she" || w === "he");
    expect(pronounIndex).toBeGreaterThan(0);
    const pronoun = words[pronounIndex];
    const referent = words[item.referentIndex];
    expect(referent).toBeDefined();
    const expectedPronoun = FEMALE_NAMES.includes(referent as string)
      ? "she"
      : "he";
    expect(pronoun).toBe(expectedPronoun);
    referentPositions.add(item.referentIndex);
    if (item.distractorIndex === null) {
      expect(item.distractorKind).toBe("none");
    } else {
      expect(words[item.distractorIndex]).toBeDefined();
      expect(item.distractorKind).not.toBe("none");
    }
  }
  expect(referentPositions.size).toBeGreaterThanOrEqual(3);
  expect(referentPositions).toEqual(new Set([0, 1, 2, 3]));
});

test("distractor lines mix opposite and same gender names evenly", () => {
  const corpus = generateCorpus(64);
  const all = [...corpus.train, ...corpus.heldOut];
  const opposite = all.filter((item) => item.distractorKind === "opposite");
  const same = all.filter((item) => item.distractorKind === "same");
  expect(
    Math.abs(opposite.length - same.length) / (opposite.length + same.length),
  ).toBeLessThan(0.1);
  for (const item of [...opposite, ...same]) {
    const words = item.text.split(" ");
    const referent = words[item.referentIndex] as string;
    const distractor = words[item.distractorIndex as number] as string;
    const referentIsFemale = FEMALE_NAMES.includes(referent);
    const distractorIsFemale = FEMALE_NAMES.includes(distractor);
    expect(FEMALE_NAMES.includes(distractor) || MALE_NAMES.includes(distractor)).toBe(true);
    if (item.distractorKind === "opposite") {
      expect(distractorIsFemale).not.toBe(referentIsFemale);
    } else {
      expect(distractorIsFemale).toBe(referentIsFemale);
      expect(distractor).not.toBe(referent);
    }
  }
  expect(corpus.heldOut.filter((item) => item.distractorKind === "opposite").length).toBeGreaterThanOrEqual(50);
  expect(corpus.heldOut.filter((item) => item.distractorKind === "same").length).toBeGreaterThanOrEqual(50);
});

test("held-out lines never appear in training", () => {
  const { train, heldOut } = generateCorpus(64);
  const trainSet = new Set(train.map((item) => item.text));
  for (const item of heldOut) {
    expect(trainSet.has(item.text)).toBe(false);
  }
  expect(heldOut.length).toBeGreaterThanOrEqual(200);
  expect(train.length).toBeGreaterThanOrEqual(2000);
});
