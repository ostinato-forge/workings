import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { replayCurve, type CurvePoint } from "../src/engine/curve-replay";
import { assertRunRecordInvariants } from "../src/engine/run-record";
import { runBigramBabble } from "../src/engine/bigram";
import { generateKnobFieldCorpus } from "./corpora/knobfield";

describe("curve replay over the shipped divergence curves", () => {
  const { curve } = JSON.parse(
    readFileSync("models/weights/curves.json", "utf8"),
  ) as { curve: CurvePoint[] };

  test("the shipped curve replays into a valid record with the gated gap", () => {
    const result = replayCurve(curve);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    assertRunRecordInvariants(result.record);
    expect(result.record.steps).toHaveLength(curve.length - 1);
    expect(result.record.final.gap).toBeGreaterThan(0.5);
  });
});

describe("bigram babble over the gate corpus", () => {
  const corpus = generateKnobFieldCorpus();

  test("babbles deterministically and only along counted pairs", () => {
    const run = () =>
      runBigramBabble({
        lines: corpus.train,
        generateFrom: "emma",
        maxGenerated: 2,
        seed: 64,
      });
    const a = run();
    const b = run();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(JSON.stringify(a.record)).toBe(JSON.stringify(b.record));
    assertRunRecordInvariants(a.record);
    expect(a.record.final.generated.length).toBeGreaterThan(0);
  });
});
