import type { EngineProblem } from "./run-record";

export type KnobFieldSpec = {
  classes: string[];
  classOf: Record<string, string>;
};

export type KnobFieldModel = {
  spec: KnobFieldSpec;
  weights: Record<string, Record<string, number>>;
};

export function validateKnobFieldSpec(
  spec: KnobFieldSpec,
): EngineProblem | null {
  if (spec.classes.length === 0) {
    return {
      what: "The knob field has no classes.",
      fix: "Declare at least one class and assign every token to one.",
    };
  }
  const tokens = Object.keys(spec.classOf);
  if (tokens.length === 0) {
    return {
      what: "The knob field has no tokens.",
      fix: "Assign at least one token to a class.",
    };
  }
  const declared = new Set(spec.classes);
  for (const [token, cls] of Object.entries(spec.classOf)) {
    if (!declared.has(cls)) {
      return {
        what: `The token "${token}" is assigned to "${cls}", which is not a declared class.`,
        fix: "Add the class to the class list or assign the token to a declared class.",
      };
    }
  }
  return null;
}

export function createKnobField(spec: KnobFieldSpec): KnobFieldModel {
  const weights: KnobFieldModel["weights"] = {};
  for (const from of spec.classes) {
    const row: Record<string, number> = {};
    for (const to of spec.classes) row[to] = 0;
    weights[from] = row;
  }
  return { spec, weights };
}

function classSize(spec: KnobFieldSpec, cls: string): number {
  return Object.values(spec.classOf).filter((c) => c === cls).length;
}

function classOfToken(model: KnobFieldModel, token: string): string {
  const cls = model.spec.classOf[token];
  if (cls === undefined) {
    throw new Error(`token "${token}" is not in the knob-field spec`);
  }
  return cls;
}

export function forwardKnobField(
  model: KnobFieldModel,
  prevToken: string,
): { classProbs: Record<string, number>; tokenProbs: Record<string, number> } {
  const fromClass = classOfToken(model, prevToken);
  const row = model.weights[fromClass] as Record<string, number>;
  const maxW = Math.max(...model.spec.classes.map((c) => row[c] as number));
  let denom = 0;
  const exps: Record<string, number> = {};
  for (const c of model.spec.classes) {
    const e = Math.exp((row[c] as number) - maxW);
    exps[c] = e;
    denom += e;
  }
  const classProbs: Record<string, number> = {};
  for (const c of model.spec.classes) classProbs[c] = (exps[c] as number) / denom;
  const tokenProbs: Record<string, number> = {};
  for (const [token, cls] of Object.entries(model.spec.classOf)) {
    tokenProbs[token] =
      (classProbs[cls] as number) / classSize(model.spec, cls);
  }
  return { classProbs, tokenProbs };
}

export function lossAndGradient(
  model: KnobFieldModel,
  transitions: readonly [string, string][],
): { loss: number; gradient: Record<string, Record<string, number>> } {
  if (transitions.length === 0) {
    throw new Error("lossAndGradient requires at least one transition");
  }
  const gradient: Record<string, Record<string, number>> = {};
  for (const from of model.spec.classes) {
    const row: Record<string, number> = {};
    for (const to of model.spec.classes) row[to] = 0;
    gradient[from] = row;
  }
  let loss = 0;
  for (const [prev, next] of transitions) {
    const fromClass = classOfToken(model, prev);
    const nextClass = classOfToken(model, next);
    const { classProbs } = forwardKnobField(model, prev);
    loss -= Math.log(
      (classProbs[nextClass] as number) / classSize(model.spec, nextClass),
    );
    const row = gradient[fromClass] as Record<string, number>;
    for (const c of model.spec.classes) {
      row[c] =
        (row[c] as number) +
        ((classProbs[c] as number) - (c === nextClass ? 1 : 0));
    }
  }
  const n = transitions.length;
  for (const from of model.spec.classes) {
    const row = gradient[from] as Record<string, number>;
    for (const to of model.spec.classes) row[to] = (row[to] as number) / n;
  }
  return { loss: loss / n, gradient };
}

import {
  snapshot,
  type EngineResult,
  type RunRecord,
} from "./run-record";

export type KnobFieldTrainConfig = {
  learningRate: number;
  steps: number;
};

export type Knob = {
  from: string;
  to: string;
  gradient: number;
  delta: number;
  value: number;
};

export type KnobFieldState = {
  weights: Record<string, Record<string, number>>;
  loss: number;
};

export type KnobFieldEvent = {
  kind: "gradient-step";
  lossBefore: number;
  lossAfter: number;
  knobs: Knob[];
};

export type KnobFieldRecord = RunRecord<
  KnobFieldTrainConfig,
  KnobFieldState,
  KnobFieldEvent
>;

function corpusTransitions(
  spec: KnobFieldSpec,
  lines: readonly string[],
):
  | { ok: true; transitions: [string, string][] }
  | { ok: false; problem: { what: string; fix: string } } {
  const transitions: [string, string][] = [];
  for (const line of lines) {
    const tokens = line.split(" ").filter((w) => w.length > 0);
    for (const token of tokens) {
      if (spec.classOf[token] === undefined) {
        return {
          ok: false,
          problem: {
            what: `The corpus contains the token "${token}", which has no class in the knob field.`,
            fix: "Assign the token to a class or remove the line that uses it.",
          },
        };
      }
    }
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      transitions.push([tokens[i] as string, tokens[i + 1] as string]);
    }
  }
  if (transitions.length === 0) {
    return {
      ok: false,
      problem: {
        what: "The corpus has no adjacent token pairs to learn from.",
        fix: "Add at least one line with two or more tokens.",
      },
    };
  }
  return { ok: true, transitions };
}

export function trainKnobField(
  spec: KnobFieldSpec,
  lines: readonly string[],
  config: KnobFieldTrainConfig,
): EngineResult<KnobFieldRecord> {
  const specProblem = validateKnobFieldSpec(spec);
  if (specProblem !== null) return { ok: false, problem: specProblem };
  if (!Number.isFinite(config.learningRate) || config.learningRate <= 0) {
    return {
      ok: false,
      problem: {
        what: "The learning rate must be a positive number.",
        fix: "Set the learning rate above 0. Small values learn slowly; large values can overshoot.",
      },
    };
  }
  if (!Number.isInteger(config.steps) || config.steps <= 0) {
    return {
      ok: false,
      problem: {
        what: "The number of gradient steps must be a whole number, at least 1.",
        fix: "Set it to a positive whole number.",
      },
    };
  }
  const prepared = corpusTransitions(spec, lines);
  if (!prepared.ok) return { ok: false, problem: prepared.problem };
  const { transitions } = prepared;

  const model = createKnobField(spec);
  let { loss } = lossAndGradient(model, transitions);
  let state: KnobFieldState = { weights: snapshot(model.weights), loss };
  const initial = snapshot(state);
  const steps: KnobFieldRecord["steps"] = [];

  for (let stepIndex = 0; stepIndex < config.steps; stepIndex += 1) {
    const before = snapshot(state);
    const { loss: lossBefore, gradient } = lossAndGradient(model, transitions);
    const knobs: Knob[] = [];
    for (const from of spec.classes) {
      for (const to of spec.classes) {
        const g = gradient[from]?.[to] as number;
        const delta = -config.learningRate * g;
        const value = ((model.weights[from] as Record<string, number>)[to] as number) + delta;
        (model.weights[from] as Record<string, number>)[to] = value;
        knobs.push({ from, to, gradient: g, delta, value });
      }
    }
    const lossAfter = lossAndGradient(model, transitions).loss;
    loss = lossAfter;
    state = { weights: snapshot(model.weights), loss: lossAfter };
    steps.push({
      index: steps.length,
      event: { kind: "gradient-step", lossBefore, lossAfter, knobs },
      before,
      after: snapshot(state),
    });
  }

  return {
    ok: true,
    record: {
      engine: "knob-field",
      seed: 0,
      config: snapshot(config),
      initial,
      final: snapshot(state),
      steps,
    },
  };
}

export type KnobFieldReport = {
  meanSurprise: number;
  transitions: { prev: string; next: string; surprise: number }[];
};

export function evaluateKnobField(
  model: KnobFieldModel,
  lines: readonly string[],
):
  | { ok: true; report: KnobFieldReport }
  | { ok: false; problem: { what: string; fix: string } } {
  const prepared = corpusTransitions(model.spec, lines);
  if (!prepared.ok) return { ok: false, problem: prepared.problem };
  const transitions: KnobFieldReport["transitions"] = [];
  let total = 0;
  for (const [prev, next] of prepared.transitions) {
    const { tokenProbs } = forwardKnobField(model, prev);
    const surprise = -Math.log(tokenProbs[next] as number);
    transitions.push({ prev, next, surprise });
    total += surprise;
  }
  return {
    ok: true,
    report: {
      meanSurprise: total / transitions.length,
      transitions,
    },
  };
}
