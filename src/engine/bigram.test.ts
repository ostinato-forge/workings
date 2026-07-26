import { describe, expect, test } from "vitest";
import { assertRunRecordInvariants } from "./run-record";
import {
  countBigrams,
  evaluateBigramCoverage,
  runBigramBabble,
} from "./bigram";

const LINES = ["the cat sat", "the cat ate", "the dog sat"];

describe("countBigrams", () => {
  test("counts adjacent pairs within lines", () => {
    const counts = countBigrams(LINES);
    expect(counts["the"]).toEqual({ cat: 2, dog: 1 });
    expect(counts["cat"]).toEqual({ sat: 1, ate: 1 });
    expect(counts["dog"]).toEqual({ sat: 1 });
    expect(counts["sat"]).toBeUndefined();
  });
});

describe("evaluateBigramCoverage", () => {
  test("marks unseen transitions with count zero", () => {
    const counts = countBigrams(LINES);
    const report = evaluateBigramCoverage(counts, ["the dog ate", "the cat sat"]);
    expect(report.lineCount).toBe(2);
    expect(report.linesWithUnseenTransition).toBe(1);
    const dogAte = report.transitions.find(
      (t) => t.prev === "dog" && t.next === "ate",
    );
    expect(dogAte?.count).toBe(0);
    const theCat = report.transitions.find(
      (t) => t.prev === "the" && t.next === "cat",
    );
    expect(theCat?.count).toBe(2);
  });
});

describe("runBigramBabble", () => {
  const config = {
    lines: LINES,
    generateFrom: "the",
    maxGenerated: 5,
    seed: 64,
  };

  test("produces a valid record: counting steps then generation steps", () => {
    const result = runBigramBabble(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { record } = result;
    assertRunRecordInvariants(record);
    expect(record.engine).toBe("bigram");
    const countSteps = record.steps.filter((s) => s.event.kind === "count-line");
    expect(countSteps).toHaveLength(3);
    expect(record.final.counts["the"]).toEqual({ cat: 2, dog: 1 });
    const generateSteps = record.steps.filter((s) => s.event.kind === "generate");
    expect(generateSteps.length).toBeGreaterThan(0);
    for (const step of generateSteps) {
      if (step.event.kind !== "generate") continue;
      const { candidates, sampled } = step.event;
      const probMass = candidates.reduce((s, c) => s + c.prob, 0);
      expect(probMass).toBeCloseTo(1, 10);
      const winner = candidates.find((c) => c.token === sampled);
      expect(winner).toBeDefined();
      expect(winner?.count).toBeGreaterThan(0);
    }
    expect(["generated-max", "no-continuation"]).toContain(
      record.final.reason,
    );
  });

  test("is deterministic under a seed", () => {
    const a = runBigramBabble(config);
    const b = runBigramBabble(config);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(JSON.stringify(a.record)).toBe(JSON.stringify(b.record));
    }
  });

  test("a dead-end start produces a dead-end step, not an invalid record", () => {
    const result = runBigramBabble({ ...config, generateFrom: "sat" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    assertRunRecordInvariants(result.record);
    expect(result.record.final.reason).toBe("no-continuation");
    expect(result.record.final.generated).toEqual([]);
    const deadEnd = result.record.steps.find((s) => s.event.kind === "dead-end");
    expect(deadEnd).toBeDefined();
  });

  test("rejects a start token the corpus never saw", () => {
    const result = runBigramBabble({ ...config, generateFrom: "zebra" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problem.what).toContain("zebra");
      expect(result.problem.fix.length).toBeGreaterThan(0);
    }
  });

  test("rejects an empty corpus and invalid generation counts", () => {
    const empty = runBigramBabble({ ...config, lines: ["   "] });
    expect(empty.ok).toBe(false);
    const badMax = runBigramBabble({ ...config, maxGenerated: 0 });
    expect(badMax.ok).toBe(false);
  });
});
