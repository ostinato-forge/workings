import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildTokenizer } from "../src/engine/tokenizer";
import { deserialize } from "../src/engine/transformer";
import { assertRunRecordInvariants } from "../src/engine/run-record";
import { runTokenMachine } from "../src/engine/token-machine";
import { generateCorpus } from "./corpora/coref";

const manifest = JSON.parse(
  readFileSync("models/weights/coref-manifest.json", "utf8"),
) as { seed: number; vocabSize: number };
const model = deserialize(
  JSON.parse(readFileSync("models/weights/coref.json", "utf8")),
);
const corpus = generateCorpus(manifest.seed);
const tokenizer = buildTokenizer(
  [...corpus.train, ...corpus.heldOut].map((item) => item.text),
);

describe("token machine over the shipped weights", () => {
  const firstLine = corpus.train[0]?.text ?? "";
  const prompt = firstLine.split(" ").slice(0, 3).join(" ");

  test("generates real distributions from the shipped model", () => {
    const result = runTokenMachine(model, tokenizer, {
      prompt,
      maxNewTokens: 6,
      sampling: { temperature: 0.8, topK: 5 },
      seed: 64,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    assertRunRecordInvariants(result.record);
    expect(result.record.steps.length).toBeGreaterThan(0);
    for (const step of result.record.steps) {
      expect(step.event.candidates).toHaveLength(manifest.vocabSize);
      const fullMass = step.event.candidates.reduce(
        (s, c) => s + c.probFull,
        0,
      );
      expect(fullMass).toBeCloseTo(1, 8);
    }
  });

  test("same seed, byte-identical record", () => {
    const run = () =>
      runTokenMachine(model, tokenizer, {
        prompt,
        maxNewTokens: 6,
        sampling: { temperature: 0.8, topK: 5 },
        seed: 64,
      });
    const a = run();
    const b = run();
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(JSON.stringify(a.record)).toBe(JSON.stringify(b.record));
    }
  });

  test("temperature 0 walks the argmax path deterministically", () => {
    const result = runTokenMachine(model, tokenizer, {
      prompt,
      maxNewTokens: 4,
      sampling: { temperature: 0 },
      seed: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const step of result.record.steps) {
      const top = step.event.candidates[0];
      expect(step.event.sampledId).toBe(top?.tokenId);
    }
  });
});
