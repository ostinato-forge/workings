import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";

type Manifest = {
  weightsHash: string;
  metrics: {
    pronounAccuracy: number;
    attentionHitRate: number;
    attentionMeanWeight: number;
    distractorLines: number;
  };
};

const manifest: Manifest = JSON.parse(
  readFileSync("models/weights/coref-manifest.json", "utf8"),
);

test("shipped weights match the manifest hash", () => {
  const weights = readFileSync("models/weights/coref.json", "utf8");
  const hash = createHash("sha256").update(weights).digest("hex");
  expect(hash).toBe(manifest.weightsHash);
});

test("held-out pronoun accuracy clears the legibility bar", () => {
  expect(manifest.metrics.pronounAccuracy).toBeGreaterThanOrEqual(0.95);
});

test("final-layer attention finds the referent legibly", () => {
  expect(manifest.metrics.distractorLines).toBeGreaterThan(50);
  expect(manifest.metrics.attentionHitRate).toBeGreaterThanOrEqual(0.9);
  expect(manifest.metrics.attentionMeanWeight).toBeGreaterThanOrEqual(0.5);
});
