import { describe, expect, test } from "vitest";
import { countBigrams } from "../../src/engine/bigram";
import { generateKnobFieldCorpus } from "./knobfield";

describe("generateKnobFieldCorpus", () => {
  const corpus = generateKnobFieldCorpus();

  test("splits 64 exhaustive lines into 36 train and 28 held out", () => {
    expect(corpus.train).toHaveLength(36);
    expect(corpus.heldOut).toHaveLength(28);
    expect(new Set([...corpus.train, ...corpus.heldOut]).size).toBe(64);
  });

  test("every held-out line contains a transition the training set never shows", () => {
    const counts = countBigrams(corpus.train);
    for (const line of corpus.heldOut) {
      const tokens = line.split(" ");
      let unseen = false;
      for (let i = 0; i + 1 < tokens.length; i += 1) {
        if ((counts[tokens[i] as string]?.[tokens[i + 1] as string] ?? 0) === 0) {
          unseen = true;
        }
      }
      expect(unseen).toBe(true);
    }
  });

  test("every class transition is trained", () => {
    const { fineClassOf } = corpus;
    const seen = new Set<string>();
    for (const line of corpus.train) {
      const tokens = line.split(" ");
      for (let i = 0; i + 1 < tokens.length; i += 1) {
        seen.add(
          `${fineClassOf[tokens[i] as string]}>${fineClassOf[tokens[i + 1] as string]}`,
        );
      }
    }
    expect(seen).toEqual(new Set(["subject>verb", "verb>object"]));
  });

  test("class maps cover the full vocabulary and the coarse map merges subjects and objects", () => {
    expect(corpus.vocab).toHaveLength(12);
    for (const token of corpus.vocab) {
      expect(corpus.fineClassOf[token]).toBeDefined();
      expect(corpus.coarseClassOf[token]).toBeDefined();
    }
    expect(new Set(Object.values(corpus.fineClassOf)).size).toBe(3);
    expect(new Set(Object.values(corpus.coarseClassOf)).size).toBe(2);
  });

  test("is deterministic", () => {
    expect(generateKnobFieldCorpus()).toEqual(corpus);
  });
});
