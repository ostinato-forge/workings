import { describe, expect, test } from "vitest";
import { assertRunRecordInvariants } from "./run-record";
import {
  createKnobField,
  evaluateKnobField,
  forwardKnobField,
  lossAndGradient,
  trainKnobField,
  validateKnobFieldSpec,
  type KnobFieldSpec,
} from "./knob-field";

const SPEC: KnobFieldSpec = {
  classes: ["S", "V"],
  classOf: { emma: "S", leo: "S", calls: "V" },
};

describe("validateKnobFieldSpec", () => {
  test("accepts a well-formed spec", () => {
    expect(validateKnobFieldSpec(SPEC)).toBeNull();
  });

  test("rejects a token mapped to an undeclared class", () => {
    const problem = validateKnobFieldSpec({
      classes: ["S"],
      classOf: { emma: "S", calls: "V" },
    });
    expect(problem?.what).toContain("calls");
  });

  test("rejects an empty class list and an empty token map", () => {
    expect(validateKnobFieldSpec({ classes: [], classOf: {} })).not.toBeNull();
    expect(
      validateKnobFieldSpec({ classes: ["S"], classOf: {} }),
    ).not.toBeNull();
  });
});

describe("forwardKnobField", () => {
  test("zero weights give uniform class probabilities and uniform-within-class token probabilities", () => {
    const model = createKnobField(SPEC);
    const out = forwardKnobField(model, "emma");
    expect(out.classProbs).toEqual({ S: 0.5, V: 0.5 });
    expect(out.tokenProbs["emma"]).toBeCloseTo(0.25, 12);
    expect(out.tokenProbs["leo"]).toBeCloseTo(0.25, 12);
    expect(out.tokenProbs["calls"]).toBeCloseTo(0.5, 12);
    const mass = Object.values(out.tokenProbs).reduce((s, p) => s + p, 0);
    expect(mass).toBeCloseTo(1, 12);
  });

  test("throws on a token outside the spec (programming error)", () => {
    const model = createKnobField(SPEC);
    expect(() => forwardKnobField(model, "zebra")).toThrow(/zebra/);
  });
});

describe("lossAndGradient", () => {
  test("hand-checked values on one transition from zero weights", () => {
    const model = createKnobField(SPEC);
    const { loss, gradient } = lossAndGradient(model, [["emma", "calls"]]);
    // P(V) = 0.5, calls is alone in V, so loss = -ln(0.5) = ln 2.
    expect(loss).toBeCloseTo(Math.log(2), 12);
    expect(gradient["S"]?.["S"]).toBeCloseTo(0.5, 12);
    expect(gradient["S"]?.["V"]).toBeCloseTo(-0.5, 12);
    expect(gradient["V"]?.["S"]).toBeCloseTo(0, 12);
    expect(gradient["V"]?.["V"]).toBeCloseTo(0, 12);
  });

  test("matches finite differences on a nudged model", () => {
    const model = createKnobField(SPEC);
    model.weights["S"] = { S: 0.3, V: -0.2 };
    model.weights["V"] = { S: -0.1, V: 0.4 };
    const transitions: [string, string][] = [
      ["emma", "calls"],
      ["calls", "leo"],
      ["leo", "calls"],
    ];
    const { gradient } = lossAndGradient(model, transitions);
    const epsilon = 1e-6;
    for (const from of SPEC.classes) {
      for (const to of SPEC.classes) {
        const saved = model.weights[from]?.[to] as number;
        (model.weights[from] as Record<string, number>)[to] = saved + epsilon;
        const up = lossAndGradient(model, transitions).loss;
        (model.weights[from] as Record<string, number>)[to] = saved - epsilon;
        const down = lossAndGradient(model, transitions).loss;
        (model.weights[from] as Record<string, number>)[to] = saved;
        const numeric = (up - down) / (2 * epsilon);
        expect(gradient[from]?.[to]).toBeCloseTo(numeric, 6);
      }
    }
  });
});

describe("trainKnobField", () => {
  const lines = ["emma calls", "leo calls"];

  test("records every knob at every step and lowers the loss", () => {
    const result = trainKnobField(SPEC, lines, {
      learningRate: 0.5,
      steps: 10,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { record } = result;
    assertRunRecordInvariants(record);
    expect(record.engine).toBe("knob-field");
    expect(record.steps).toHaveLength(10);
    expect(record.initial.loss).toBeCloseTo(Math.log(2), 12);
    for (const step of record.steps) {
      expect(step.event.knobs).toHaveLength(4);
      expect(step.event.lossAfter).toBeLessThan(step.event.lossBefore);
      expect(step.after.loss).toBe(step.event.lossAfter);
    }
    expect(record.final.loss).toBeLessThan(0.2);
  });

  test("the seen class-pair knob moves up on the first step", () => {
    const result = trainKnobField(SPEC, lines, { learningRate: 1, steps: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const first = result.record.steps[0];
    const sToV = first?.event.knobs.find((k) => k.from === "S" && k.to === "V");
    expect(sToV?.gradient).toBeCloseTo(-0.5, 12);
    expect(sToV?.delta).toBeCloseTo(0.5, 12);
    expect(sToV?.value).toBeCloseTo(0.5, 12);
  });

  test("is deterministic", () => {
    const run = () =>
      trainKnobField(SPEC, lines, { learningRate: 0.5, steps: 5 });
    const a = run();
    const b = run();
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(JSON.stringify(a.record)).toBe(JSON.stringify(b.record));
    }
  });

  test("rejects corpus tokens outside the spec", () => {
    const result = trainKnobField(SPEC, ["emma pets zebra"], {
      learningRate: 0.5,
      steps: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.what).toContain("pets");
  });

  test("rejects invalid learning rates, step counts, and empty corpora", () => {
    const bad = [
      trainKnobField(SPEC, lines, { learningRate: 0, steps: 5 }),
      trainKnobField(SPEC, lines, { learningRate: Number.NaN, steps: 5 }),
      trainKnobField(SPEC, lines, { learningRate: 0.5, steps: 0 }),
      trainKnobField(SPEC, lines, { learningRate: 0.5, steps: 2.5 }),
      trainKnobField(SPEC, ["emma"], { learningRate: 0.5, steps: 5 }),
    ];
    for (const result of bad) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.problem.what.length).toBeGreaterThan(0);
        expect(result.problem.fix.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("evaluateKnobField", () => {
  test("scores held-out lines with finite surprises", () => {
    const trained = trainKnobField(SPEC, ["emma calls", "leo calls"], {
      learningRate: 0.5,
      steps: 50,
    });
    expect(trained.ok).toBe(true);
    if (!trained.ok) return;
    const model = { spec: SPEC, weights: trained.record.final.weights };
    const result = evaluateKnobField(model, ["leo calls emma"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.transitions).toHaveLength(2);
    for (const t of result.report.transitions) {
      expect(Number.isFinite(t.surprise)).toBe(true);
    }
    expect(result.report.meanSurprise).toBeGreaterThan(0);
  });

  test("rejects held-out tokens outside the spec", () => {
    const model = createKnobField(SPEC);
    const result = evaluateKnobField(model, ["emma pets"]);
    expect(result.ok).toBe(false);
  });
});
