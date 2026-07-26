import { describe, expect, test } from "vitest";
import { countBigrams, evaluateBigramCoverage } from "../src/engine/bigram";
import { evaluateKnobField, trainKnobField } from "../src/engine/knob-field";
import { generateKnobFieldCorpus } from "./corpora/knobfield";

const corpus = generateKnobFieldCorpus();
const TRAIN_CONFIG = { learningRate: 0.5, steps: 200 };

function trainedReport(
  classes: string[],
  classOf: Record<string, string>,
): { meanSurprise: number } {
  const trained = trainKnobField({ classes, classOf }, corpus.train, TRAIN_CONFIG);
  if (!trained.ok) throw new Error(`training failed: ${trained.problem.what}`);
  const model = {
    spec: { classes, classOf },
    weights: trained.record.final.weights,
  };
  const evaluated = evaluateKnobField(model, corpus.heldOut);
  if (!evaluated.ok) throw new Error(`evaluation failed: ${evaluated.problem.what}`);
  for (const t of evaluated.report.transitions) {
    if (!Number.isFinite(t.surprise)) {
      throw new Error(`non-finite surprise on ${t.prev} ${t.next}`);
    }
  }
  return evaluated.report;
}

describe("generalization gate: counting fails, weight sharing does not", () => {
  test("the bigram model breaks on held-out lines", () => {
    const counts = countBigrams(corpus.train);
    const report = evaluateBigramCoverage(counts, corpus.heldOut);
    const zeroRate = report.linesWithUnseenTransition / report.lineCount;
    expect(zeroRate).toBeGreaterThanOrEqual(0.9);
  });

  test("the fine knob field generalizes to the same lines", () => {
    const fine = trainedReport(corpus.fineClasses, corpus.fineClassOf);
    expect(fine.meanSurprise).toBeLessThanOrEqual(1.6);
    const uniform = Math.log(corpus.vocab.length);
    expect(uniform - fine.meanSurprise).toBeGreaterThanOrEqual(0.5);
  });

  test("the finer knob field beats the coarser one held out", () => {
    const fine = trainedReport(corpus.fineClasses, corpus.fineClassOf);
    const coarse = trainedReport(corpus.coarseClasses, corpus.coarseClassOf);
    expect(coarse.meanSurprise - fine.meanSurprise).toBeGreaterThanOrEqual(
      0.25,
    );
  });
});
